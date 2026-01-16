import { Router, type Request, type Response, type IRouter } from 'express';
import { createFacilitator, type FacilitatorConfig, type TokenConfig, getSolanaPublicKey, networkToCaip2 } from '@openfacilitator/core';
import { z } from 'zod';
import { createTransaction, updateTransactionStatus } from '../db/transactions.js';
import type { Hex } from 'viem';

const router: IRouter = Router();

// Payment requirements schema (shared)
const paymentRequirementsSchema = z.object({
  scheme: z.string(),
  network: z.string(),
  maxAmountRequired: z.string(),
  resource: z.string().default(''),
  asset: z.string(),
  payTo: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  maxTimeoutSeconds: z.number().optional(),
  outputSchema: z.record(z.unknown()).optional(),
  extra: z.record(z.unknown()).optional(),
});

const verifyRequestSchema = z.object({
  x402Version: z.number().optional(),
  paymentPayload: z.union([z.string(), z.object({}).passthrough()]),
  paymentRequirements: paymentRequirementsSchema,
});

const settleRequestSchema = verifyRequestSchema;

/**
 * Normalize paymentPayload to string format
 */
function normalizePaymentPayload(payload: string | object): string {
  if (typeof payload === 'string') {
    return payload;
  }
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/**
 * Get free facilitator configuration from environment
 */
function getFreeFacilitatorConfig(): { config: FacilitatorConfig; evmPrivateKey?: string; solanaPrivateKey?: string } | null {
  const evmPrivateKey = process.env.FREE_FACILITATOR_EVM_KEY;
  const solanaPrivateKey = process.env.FREE_FACILITATOR_SOLANA_KEY;
  const evmAddress = process.env.FREE_FACILITATOR_EVM_ADDRESS;
  const solanaAddress = process.env.FREE_FACILITATOR_SOLANA_ADDRESS;

  // At minimum we need one wallet configured
  if (!evmPrivateKey && !solanaPrivateKey) {
    return null;
  }

  // Build supported chains and tokens based on what's configured
  const supportedChains: (number | string)[] = [];
  const supportedTokens: TokenConfig[] = [];

  // Add Base mainnet if EVM key is configured
  if (evmPrivateKey) {
    supportedChains.push(8453); // Base mainnet
    supportedTokens.push({
      symbol: 'USDC',
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      decimals: 6,
      chainId: 8453,
    });
  }

  // Add Solana mainnet if Solana key is configured
  if (solanaPrivateKey) {
    supportedChains.push('solana');
    supportedTokens.push({
      symbol: 'USDC',
      address: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      decimals: 6,
      chainId: 'solana',
    });
  }

  const config: FacilitatorConfig = {
    id: 'free-facilitator',
    name: 'OpenFacilitator Free',
    subdomain: 'free',
    ownerAddress: (evmAddress || '0x0000000000000000000000000000000000000000') as `0x${string}`,
    supportedChains,
    supportedTokens,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return { config, evmPrivateKey, solanaPrivateKey };
}

/**
 * Check if a network identifier is a Solana network
 */
function isSolanaNetwork(network: string): boolean {
  return network === 'solana' ||
         network === 'solana-mainnet' ||
         network === 'solana-devnet' ||
         network.startsWith('solana:');
}

/**
 * GET /free/supported - Get supported payment networks (no auth required)
 */
router.get('/free/supported', (_req: Request, res: Response) => {
  const facilitatorData = getFreeFacilitatorConfig();

  if (!facilitatorData) {
    res.status(503).json({
      error: 'Free facilitator not configured',
      message: 'The free facilitator is not available. Please self-host or use a managed instance.',
    });
    return;
  }

  const facilitator = createFacilitator(facilitatorData.config);
  const supported = facilitator.getSupported();

  // Build signers object with namespace prefixes
  const signers: Record<string, string[]> = {};
  const evmAddress = process.env.FREE_FACILITATOR_EVM_ADDRESS;

  // Add EVM signer if configured
  if (evmAddress) {
    signers['eip155:*'] = [evmAddress];
  }

  // Add feePayer for Solana if configured
  if (facilitatorData.solanaPrivateKey) {
    try {
      const solanaFeePayer = getSolanaPublicKey(facilitatorData.solanaPrivateKey);

      // Add to signers
      signers['solana:*'] = [solanaFeePayer];

      // Add feePayer to Solana kinds (both v1 human-readable and v2 CAIP-2 formats)
      supported.kinds = supported.kinds.map(kind => {
        if (isSolanaNetwork(kind.network)) {
          return {
            ...kind,
            extra: {
              ...kind.extra,
              feePayer: solanaFeePayer,
            },
          };
        }
        return kind;
      });
    } catch (e) {
      console.error('Failed to get Solana fee payer address:', e);
    }
  }

  // Add signers and extensions to response
  supported.signers = signers;
  supported.extensions = [];

  res.json(supported);
});

/**
 * POST /free/verify - Verify a payment (no auth required)
 */
router.post('/free/verify', async (req: Request, res: Response) => {
  try {
    const facilitatorData = getFreeFacilitatorConfig();

    if (!facilitatorData) {
      res.status(503).json({
        isValid: false,
        invalidReason: 'Free facilitator not configured',
      });
      return;
    }

    const parsed = verifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        isValid: false,
        invalidReason: 'Invalid request format',
        details: parsed.error.issues,
      });
      return;
    }

    const paymentPayload = normalizePaymentPayload(parsed.data.paymentPayload);
    const { paymentRequirements } = parsed.data;

    const facilitator = createFacilitator(facilitatorData.config);
    const result = await facilitator.verify(paymentPayload, paymentRequirements);

    // Log verification (for analytics)
    if (result.payer) {
      createTransaction({
        facilitator_id: 'free-facilitator',
        type: 'verify',
        network: paymentRequirements.network,
        from_address: result.payer,
        to_address: paymentRequirements.payTo || 'unknown',
        amount: paymentRequirements.maxAmountRequired,
        asset: paymentRequirements.asset,
        status: result.isValid ? 'success' : 'failed',
        error_message: result.invalidReason,
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Free verify error:', error);
    res.status(500).json({
      isValid: false,
      invalidReason: 'Internal server error',
    });
  }
});

/**
 * POST /free/settle - Settle a payment (no auth required)
 */
router.post('/free/settle', async (req: Request, res: Response) => {
  try {
    const facilitatorData = getFreeFacilitatorConfig();

    const parsed = settleRequestSchema.safeParse(req.body);
    const networkForError = parsed.success ? parsed.data.paymentRequirements.network : '';

    if (!facilitatorData) {
      res.status(503).json({
        success: false,
        transaction: '',
        payer: '',
        network: networkForError,
        errorReason: 'Free facilitator not configured',
      });
      return;
    }

    if (!parsed.success) {
      res.status(400).json({
        success: false,
        transaction: '',
        payer: '',
        network: networkForError,
        errorReason: 'Invalid request format',
        details: parsed.error.issues,
      });
      return;
    }

    // After this point, parsed.success is true so we can access the full requirements
    const paymentRequirements = parsed.data.paymentRequirements;
    const paymentPayload = normalizePaymentPayload(parsed.data.paymentPayload);

    const facilitator = createFacilitator(facilitatorData.config);

    // Determine which private key to use based on network (supports both v1 and CAIP-2 formats)
    const isSolana = isSolanaNetwork(paymentRequirements.network);

    let privateKey: string | undefined;

    if (isSolana) {
      if (!facilitatorData.solanaPrivateKey) {
        res.status(503).json({
          success: false,
          transaction: '',
          payer: '',
          network: paymentRequirements.network,
          errorReason: 'Solana not available on free facilitator',
        });
        return;
      }
      privateKey = facilitatorData.solanaPrivateKey;
    } else {
      if (!facilitatorData.evmPrivateKey) {
        res.status(503).json({
          success: false,
          transaction: '',
          payer: '',
          network: paymentRequirements.network,
          errorReason: 'EVM chains not available on free facilitator',
        });
        return;
      }
      privateKey = facilitatorData.evmPrivateKey;
    }

    const result = await facilitator.settle(paymentPayload, paymentRequirements, privateKey);

    // Log settlement
    const decoded = Buffer.from(paymentPayload, 'base64').toString('utf-8');
    const parsedPayload = JSON.parse(decoded);

    // Extract from_address - handle both flat and nested payload structures
    let fromAddress = 'unknown';
    if (isSolana) {
      fromAddress = paymentRequirements.payTo || 'solana-payer';
    } else {
      // For EVM, use authorization.from - handle both nested and flat formats
      const authorization = parsedPayload.authorization || parsedPayload.payload?.authorization;
      fromAddress = authorization?.from || 'unknown';
    }

    const txRecord = createTransaction({
      facilitator_id: 'free-facilitator',
      type: 'settle',
      network: paymentRequirements.network,
      from_address: fromAddress,
      to_address: paymentRequirements.payTo || 'unknown',
      amount: paymentRequirements.maxAmountRequired,
      asset: paymentRequirements.asset,
      status: result.success ? 'pending' : 'failed',
      transaction_hash: result.transaction,
      error_message: result.errorReason,
    });

    if (result.success && txRecord) {
      updateTransactionStatus(txRecord.id, 'success');
    }

    res.json(result);
  } catch (error) {
    console.error('Free settle error:', error);
    res.status(500).json({
      success: false,
      transaction: '',
      payer: '',
      network: '',
      errorReason: 'Internal server error',
    });
  }
});

/**
 * GET /free/info - Get info about the free facilitator
 */
router.get('/free/info', (_req: Request, res: Response) => {
  const facilitatorData = getFreeFacilitatorConfig();
  
  const evmAddress = process.env.FREE_FACILITATOR_EVM_ADDRESS;
  const solanaAddress = process.env.FREE_FACILITATOR_SOLANA_ADDRESS;

  res.json({
    name: 'OpenFacilitator Free',
    description: 'Free public x402 payment facilitator. No account required.',
    endpoints: {
      supported: 'https://api.openfacilitator.io/free/supported',
      verify: 'https://api.openfacilitator.io/free/verify',
      settle: 'https://api.openfacilitator.io/free/settle',
    },
    networks: {
      base: facilitatorData?.evmPrivateKey ? {
        available: true,
        feePayerAddress: evmAddress,
      } : { available: false },
      solana: facilitatorData?.solanaPrivateKey ? {
        available: true,
        feePayerAddress: solanaAddress,
      } : { available: false },
    },
    limits: {
      note: 'Fair use policy applies. For high-volume usage, please self-host or get a managed instance.',
    },
  });
});

export { router as publicRouter };

