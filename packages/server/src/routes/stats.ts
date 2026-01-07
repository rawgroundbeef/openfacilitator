/**
 * Stats API - x402 protected endpoint for platform statistics
 *
 * GET /stats - Returns global and per-facilitator statistics
 * Requires $5 USDC payment via x402 protocol
 */
import { Router, type Request, type Response, type IRouter } from 'express';
import { getGlobalStats } from '../db/transactions.js';

const router: IRouter = Router();

// Configuration
const STATS_PRICE_ATOMIC = '5000000'; // $5 USDC (6 decimals)
const USDC_SOLANA_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Facilitator endpoint (pay.openfacilitator.io is a registered facilitator)
const FACILITATOR_URL = 'https://pay.openfacilitator.io';

// Payment recipient - free facilitator's Solana address
const STATS_PAY_TO = 'Hbe1vdFs4EQVVAzcV12muHhr6DEKwrT9roMXGPLxLBLP';

/**
 * Build payment requirements for the stats endpoint
 */
function getPaymentRequirements() {
  return {
    scheme: 'exact',
    network: 'solana',
    maxAmountRequired: STATS_PRICE_ATOMIC,
    resource: 'https://api.openfacilitator.io/stats',
    asset: USDC_SOLANA_MINT,
    payTo: STATS_PAY_TO,
    description: 'OpenFacilitator Platform Statistics - $5 per request',
    extra: {
      feePayer: STATS_PAY_TO,
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        paymentTxHash: { type: 'string' },
        timestamp: { type: 'string' },
        stats: {
          type: 'object',
          properties: {
            global: {
              type: 'object',
              properties: {
                totalTransactionsAllTime: { type: 'number' },
                totalTransactions24h: { type: 'number' },
                volumeUsdAllTime: { type: 'string' },
                volumeUsd24h: { type: 'string' },
                uniqueWallets: { type: 'number' },
              },
            },
            facilitators: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  subdomain: { type: 'string' },
                  transactionCount: { type: 'number' },
                  volumeUsd: { type: 'string' },
                  uniqueWallets: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
  };
}

/**
 * GET /stats - Platform statistics (x402 protected)
 */
router.get('/stats', async (req: Request, res: Response) => {
  const paymentHeader = req.header('X-PAYMENT');
  const requirements = getPaymentRequirements();

  // If no payment provided, return 402 with requirements
  if (!paymentHeader) {
    res.status(402).json({
      x402Version: 1,
      accepts: [requirements],
      error: 'Payment Required',
      message: 'This endpoint requires a $5 USDC payment via x402',
    });
    return;
  }

  try {

    // Decode payment payload
    let paymentPayload: unknown;
    try {
      const decoded = Buffer.from(paymentHeader, 'base64').toString('utf-8');
      paymentPayload = JSON.parse(decoded);
    } catch {
      res.status(400).json({
        error: 'Invalid payment payload',
        message: 'Could not decode X-PAYMENT header',
      });
      return;
    }

    // Step 1: Verify payment with facilitator
    const verifyResponse = await fetch(`${FACILITATOR_URL}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload,
        paymentRequirements: requirements,
      }),
    });

    const verifyResult = (await verifyResponse.json()) as {
      valid?: boolean;
      invalidReason?: string;
    };

    if (!verifyResult.valid) {
      res.status(402).json({
        error: 'Payment verification failed',
        reason: verifyResult.invalidReason || 'Unknown verification error',
        accepts: [requirements],
      });
      return;
    }

    // Step 2: Settle payment
    const settleResponse = await fetch(`${FACILITATOR_URL}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        x402Version: 1,
        paymentPayload,
        paymentRequirements: requirements,
      }),
    });

    const settleResult = (await settleResponse.json()) as {
      success?: boolean;
      transactionHash?: string;
      errorMessage?: string;
    };

    if (!settleResult.success) {
      res.status(402).json({
        error: 'Payment settlement failed',
        reason: settleResult.errorMessage || 'Unknown settlement error',
        accepts: [requirements],
      });
      return;
    }

    // Payment successful - return stats
    const stats = getGlobalStats();

    res.json({
      success: true,
      paymentTxHash: settleResult.transactionHash,
      timestamp: new Date().toISOString(),
      stats,
    });
  } catch (error) {
    console.error('[Stats] Error processing request:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /stats/price - Get the current price for stats access (no payment required)
 */
router.get('/stats/price', (_req: Request, res: Response) => {
  res.json({
    price: {
      amount: STATS_PRICE_ATOMIC,
      amountUsd: '5.00',
      asset: USDC_SOLANA_MINT,
      network: 'solana',
    },
    payTo: STATS_PAY_TO,
  });
});

// OpenFacilitator icon SVG
const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="hsl(217, 91%, 50%)"/>
  <g transform="translate(4, 4)" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
    <path d="m9 12 2 2 4-4"/>
  </g>
</svg>`;

/**
 * GET /.well-known/x402-verification.json - Domain verification for x402jobs
 */
router.get('/.well-known/x402-verification.json', (_req: Request, res: Response) => {
  res.json({ x402: '5529268e5dda' });
});

/**
 * GET /favicon.ico - Serve OpenFacilitator icon for API domain
 */
router.get('/favicon.ico', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(ICON_SVG);
});

/**
 * GET /icon.svg - Serve OpenFacilitator icon for API domain
 */
router.get('/icon.svg', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.send(ICON_SVG);
});

export { router as statsRouter };
