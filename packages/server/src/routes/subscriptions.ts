import { Router, type Request, type Response, type IRouter } from 'express';
import { z } from 'zod';
import {
  createSubscription,
  getActiveSubscription,
  extendSubscription,
  userExists,
  SUBSCRIPTION_PRICING,
  type SubscriptionTier,
} from '../db/subscriptions.js';
import { getUserWalletByUserId } from '../db/user-wallets.js';
import { decryptPrivateKey } from '../utils/crypto.js';
import { makeX402Payment } from '../services/x402-client.js';
import { requireAuth } from '../middleware/auth.js';

// Memeputer x402 endpoints
const MEMEPUTER_X402_BASE_URL = process.env.MEMEPUTER_X402_BASE_URL;

function getMemeputerEndpoint(): string {
  return `${MEMEPUTER_X402_BASE_URL}/x402/solana/openfacilitator_agent/subscribe_basic`;
}

const router: IRouter = Router();

// Validation schema for activate endpoint
// Memeputer only sends userId - payment is handled before webhook
const activateSchema = z.object({
  userId: z.string().min(1),
  tier: z.enum(['starter']).optional().default('starter'),
});

/**
 * Middleware to verify Memeputer webhook secret
 */
function verifyWebhookSecret(req: Request, res: Response, next: () => void): void {
  const secret = process.env.MEMEPUTER_WEBHOOK_SECRET;

  // If no secret is configured, skip verification (development mode)
  if (!secret) {
    console.warn('MEMEPUTER_WEBHOOK_SECRET not set - webhook verification disabled');
    next();
    return;
  }

  const providedSecret = req.headers['x-webhook-secret'] as string;

  if (!providedSecret || providedSecret !== secret) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing webhook secret',
    });
    return;
  }

  next();
}

/**
 * POST /api/subscriptions/activate
 * Called by Memeputer agent after successful payment
 *
 * This webhook is now a backup/fallback mechanism.
 * The /purchase endpoint creates subscriptions directly with tx hash.
 * This webhook handles cases where:
 * - The subscription was created by /purchase (idempotent - just return success)
 * - The /purchase endpoint failed after payment (create subscription as fallback)
 *
 * Headers:
 *   Content-Type: application/json
 *   X-Webhook-Secret: <MEMEPUTER_WEBHOOK_SECRET>
 *
 * Body:
 *   { userId: string, tier: "basic" | "pro" }
 */
router.post('/activate', verifyWebhookSecret, async (req: Request, res: Response) => {
  try {
    const parsed = activateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.issues,
      });
      return;
    }

    const { userId, tier } = parsed.data;
    const subscriptionTier: SubscriptionTier = 'starter';

    console.log(`[Activate Webhook] Received for user ${userId}`);

    // Validate user exists
    if (!userExists(userId)) {
      res.status(404).json({
        error: 'User not found',
        message: `User with ID ${userId} does not exist`,
      });
      return;
    }

    // Check for existing active subscription
    const existingSub = getActiveSubscription(userId);

    // If subscription already exists, this is likely a duplicate call
    // (subscription was already created by /purchase). Return success without creating.
    if (existingSub) {
      // Check if subscription was created recently (within last 5 minutes)
      const createdAt = new Date(existingSub.created_at);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

      if (createdAt > fiveMinutesAgo) {
        console.log(`[Activate Webhook] Subscription already exists for user ${userId} (created ${existingSub.created_at}), returning success`);
        res.json({
          success: true,
          tier: existingSub.tier,
          expires: existingSub.expires_at,
          note: 'Subscription already active',
        });
        return;
      }
    }

    // No recent subscription found - create/extend as fallback
    let subscription;
    const SUBSCRIPTION_DAYS = 30;

    if (existingSub) {
      // Extend existing subscription (no tx hash from webhook)
      subscription = extendSubscription(existingSub.id, SUBSCRIPTION_DAYS, subscriptionTier);
      console.log(`[Activate Webhook] Extended subscription for user ${userId}: ${subscription?.expires_at}`);
    } else {
      // Create new subscription (no tx hash from webhook)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + SUBSCRIPTION_DAYS);

      subscription = createSubscription(userId, subscriptionTier, expiresAt);
      console.log(`[Activate Webhook] Created new subscription for user ${userId}: expires ${subscription.expires_at}`);
    }

    if (!subscription) {
      res.status(500).json({
        error: 'Failed to create subscription',
      });
      return;
    }

    res.json({
      success: true,
      tier: subscription.tier,
      expires: subscription.expires_at,
    });
  } catch (error) {
    console.error('Activate subscription error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/subscriptions/status
 * Get subscription status for authenticated user
 */
router.get('/status', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;

    const subscription = getActiveSubscription(userId);

    if (!subscription) {
      res.json({
        active: false,
        tier: null,
        expires: null,
      });
      return;
    }

    res.json({
      active: true,
      tier: subscription.tier,
      expires: subscription.expires_at,
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/subscriptions/pricing
 * Get subscription pricing (public endpoint)
 */
router.get('/pricing', (_req: Request, res: Response) => {
  res.json({
    starter: {
      price: SUBSCRIPTION_PRICING.starter,
      priceFormatted: '$5.00',
      currency: 'USDC',
      period: '30 days',
    },
  });
});

// Validation schema for purchase endpoint (tier is optional, defaults to starter)
const purchaseSchema = z.object({
  tier: z.enum(['starter']).optional().default('starter'),
});

/**
 * POST /api/subscriptions/purchase
 * Purchase a subscription using the user's custodial wallet via x402
 *
 * This endpoint:
 * 1. Gets the user's Solana wallet
 * 2. Makes an x402 payment to Memeputer
 * 3. Creates the subscription directly with the tx hash
 * 4. Returns the subscription details
 */
router.post('/purchase', requireAuth, async (req: Request, res: Response) => {
  try {
    const parsed = purchaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.issues,
      });
      return;
    }

    const subscriptionTier: SubscriptionTier = 'starter';
    const userId = req.user!.id;

    // Check if Memeputer URL is configured
    if (!MEMEPUTER_X402_BASE_URL) {
      console.error('[Purchase] MEMEPUTER_X402_BASE_URL not configured');
      res.status(500).json({
        success: false,
        error: 'Subscription service not configured',
      });
      return;
    }

    console.log(`[Purchase] User ${userId} attempting to purchase subscription`);

    // Get user's wallet
    const wallet = getUserWalletByUserId(userId);
    if (!wallet) {
      res.status(400).json({
        success: false,
        error: 'No wallet found',
        message: 'You need to create a billing wallet first. Go to your account settings.',
      });
      return;
    }

    // Decrypt private key
    let privateKey: string;
    try {
      privateKey = decryptPrivateKey(wallet.encrypted_private_key);
    } catch (error) {
      console.error('[Purchase] Failed to decrypt wallet:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to access wallet',
      });
      return;
    }

    // Get Memeputer endpoint
    const endpoint = getMemeputerEndpoint();
    console.log(`[Purchase] Calling Memeputer endpoint: ${endpoint}`);

    // Make x402 payment
    const result = await makeX402Payment(
      endpoint,
      { userId },
      privateKey,
      wallet.wallet_address
    );

    // Clear private key from memory
    privateKey = '';

    if (!result.success) {
      console.log(`[Purchase] Payment failed:`, result.error);

      if (result.insufficientBalance) {
        res.status(402).json({
          success: false,
          error: 'Insufficient balance',
          message: `You need $${result.required} USDC but only have $${result.available}`,
          required: result.required,
          available: result.available,
        });
        return;
      }

      res.status(400).json({
        success: false,
        error: result.error || 'Payment failed',
      });
      return;
    }

    console.log(`[Purchase] Payment successful for user ${userId}, txHash: ${result.txHash}`);

    // Create subscription directly with tx hash
    const SUBSCRIPTION_DAYS = 30;
    const existingSub = getActiveSubscription(userId);
    let subscription;

    if (existingSub) {
      // Extend existing subscription
      subscription = extendSubscription(existingSub.id, SUBSCRIPTION_DAYS, subscriptionTier, result.txHash);
      console.log(`[Purchase] Extended subscription for user ${userId}: ${subscription?.expires_at}`);
    } else {
      // Create new subscription
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + SUBSCRIPTION_DAYS);

      subscription = createSubscription(userId, subscriptionTier, expiresAt, result.txHash);
      console.log(`[Purchase] Created new subscription for user ${userId}: expires ${subscription.expires_at}`);
    }

    if (!subscription) {
      // Payment succeeded but subscription creation failed - this is bad
      console.error(`[Purchase] CRITICAL: Payment succeeded but subscription creation failed for user ${userId}`);
      res.status(500).json({
        success: false,
        error: 'Subscription creation failed after payment. Please contact support.',
        txHash: result.txHash,
      });
      return;
    }

    res.json({
      success: true,
      tier: subscription.tier,
      expires: subscription.expires_at,
      txHash: result.txHash,
    });
  } catch (error) {
    console.error('[Purchase] Error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
    });
  }
});

export { router as subscriptionsRouter };
