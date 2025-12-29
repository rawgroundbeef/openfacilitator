import { Router, type Request, type Response, type IRouter } from 'express';
import { z } from 'zod';
import {
  createSubscription,
  getActiveSubscription,
  extendSubscription,
  userExists,
  SUBSCRIPTION_PRICING,
} from '../db/subscriptions.js';
import { getUserWalletByUserId } from '../db/user-wallets.js';
import { decryptPrivateKey } from '../utils/crypto.js';
import { makeX402Payment } from '../services/x402-client.js';
import { requireAuth } from '../middleware/auth.js';

// Memeputer x402 endpoints
const MEMEPUTER_X402_BASE_URL = process.env.MEMEPUTER_X402_BASE_URL || 'https://agents.memeputer.com';

function getMemeputerEndpoint(tier: 'basic' | 'pro'): string {
  const command = tier === 'basic' ? 'subscribe_basic' : 'subscribe_pro';
  return `${MEMEPUTER_X402_BASE_URL}/x402/solana/openfacilitator_agent/${command}`;
}

const router: IRouter = Router();

// Validation schema for activate endpoint
// Memeputer only sends userId and tier - payment is handled before webhook
const activateSchema = z.object({
  userId: z.string().min(1),
  tier: z.enum(['basic', 'pro']),
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

    let subscription;
    const SUBSCRIPTION_DAYS = 30;

    if (existingSub) {
      // Extend existing subscription
      subscription = extendSubscription(existingSub.id, SUBSCRIPTION_DAYS, tier);
      console.log(`Extended ${tier} subscription for user ${userId}: ${subscription?.expires_at}`);
    } else {
      // Create new subscription
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + SUBSCRIPTION_DAYS);

      subscription = createSubscription(userId, tier, expiresAt);
      console.log(`Created new ${tier} subscription for user ${userId}: expires ${subscription.expires_at}`);
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
    basic: {
      price: SUBSCRIPTION_PRICING.basic,
      priceFormatted: '$5.00',
      currency: 'USDC',
      period: '30 days',
    },
    pro: {
      price: SUBSCRIPTION_PRICING.pro,
      priceFormatted: '$25.00',
      currency: 'USDC',
      period: '30 days',
    },
  });
});

// Validation schema for purchase endpoint
const purchaseSchema = z.object({
  tier: z.enum(['basic', 'pro']),
});

/**
 * POST /api/subscriptions/purchase
 * Purchase a subscription using the user's custodial wallet via x402
 *
 * This endpoint:
 * 1. Gets the user's Solana wallet
 * 2. Makes an x402 payment to Memeputer
 * 3. Returns success/failure
 *
 * The actual subscription activation happens via the /activate webhook
 * which Memeputer calls after successful payment.
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

    const { tier } = parsed.data;
    const userId = req.user!.id;

    console.log(`[Purchase] User ${userId} attempting to purchase ${tier} subscription`);

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
    const endpoint = getMemeputerEndpoint(tier);
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

    console.log(`[Purchase] Payment successful for user ${userId}, tier ${tier}`);

    // Payment was successful
    // The subscription will be activated by Memeputer calling /activate
    res.json({
      success: true,
      message: 'Payment successful! Your subscription is being activated.',
      tier,
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
