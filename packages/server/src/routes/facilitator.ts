import { Router, type Request, type Response, type IRouter } from 'express';
import { createFacilitator, type FacilitatorConfig, type TokenConfig } from '@openfacilitator/core';
import { z } from 'zod';
import { requireFacilitator } from '../middleware/tenant.js';
import { createTransaction, updateTransactionStatus } from '../db/transactions.js';
import { decryptPrivateKey } from '../utils/crypto.js';
import type { Hex } from 'viem';

const router: IRouter = Router();

// Validation schemas
const verifyRequestSchema = z.object({
  x402Version: z.number(),
  paymentPayload: z.string(),
  paymentRequirements: z.object({
    scheme: z.string(),
    network: z.string(),
    maxAmountRequired: z.string(),
    resource: z.string(),
    asset: z.string(), // Token contract address
    description: z.string().optional(),
    mimeType: z.string().optional(),
    outputSchema: z.record(z.unknown()).optional(),
    extra: z.record(z.unknown()).optional(),
  }),
});

const settleRequestSchema = verifyRequestSchema;

/**
 * GET /supported - Get supported payment networks and tokens
 */
router.get('/supported', requireFacilitator, (req: Request, res: Response) => {
  const record = req.facilitator!;

  // Build facilitator config from database record
  const config: FacilitatorConfig = {
    id: record.id,
    name: record.name,
    subdomain: record.subdomain,
    customDomain: record.custom_domain || undefined,
    ownerAddress: record.owner_address as `0x${string}`,
    supportedChains: JSON.parse(record.supported_chains),
    supportedTokens: JSON.parse(record.supported_tokens) as TokenConfig[],
    createdAt: new Date(record.created_at),
    updatedAt: new Date(record.updated_at),
  };

  const facilitator = createFacilitator(config);
  const supported = facilitator.getSupported();

  res.json(supported);
});

/**
 * POST /verify - Verify a payment payload
 */
router.post('/verify', requireFacilitator, async (req: Request, res: Response) => {
  try {
    const parsed = verifyRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.issues,
      });
      return;
    }

    const { paymentPayload, paymentRequirements } = parsed.data;
    const record = req.facilitator!;

    // Build facilitator config
    const config: FacilitatorConfig = {
      id: record.id,
      name: record.name,
      subdomain: record.subdomain,
      customDomain: record.custom_domain || undefined,
      ownerAddress: record.owner_address as `0x${string}`,
      supportedChains: JSON.parse(record.supported_chains),
      supportedTokens: JSON.parse(record.supported_tokens) as TokenConfig[],
      createdAt: new Date(record.created_at),
      updatedAt: new Date(record.updated_at),
    };

    const facilitator = createFacilitator(config);
    const result = await facilitator.verify(paymentPayload, paymentRequirements);

    // Log the verification attempt
    if (result.payer) {
      createTransaction({
        facilitator_id: record.id,
        type: 'verify',
        network: paymentRequirements.network,
        from_address: result.payer,
        to_address: record.owner_address,
        amount: paymentRequirements.maxAmountRequired,
        asset: paymentRequirements.asset,
        status: result.valid ? 'success' : 'failed',
        error_message: result.invalidReason,
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Verify error:', error);
    res.status(500).json({
      valid: false,
      invalidReason: 'Internal server error',
    });
  }
});

/**
 * POST /settle - Settle a payment
 */
router.post('/settle', requireFacilitator, async (req: Request, res: Response) => {
  try {
    const parsed = settleRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Invalid request',
        details: parsed.error.issues,
      });
      return;
    }

    const { paymentPayload, paymentRequirements } = parsed.data;
    const record = req.facilitator!;

    // Build facilitator config
    const config: FacilitatorConfig = {
      id: record.id,
      name: record.name,
      subdomain: record.subdomain,
      customDomain: record.custom_domain || undefined,
      ownerAddress: record.owner_address as `0x${string}`,
      supportedChains: JSON.parse(record.supported_chains),
      supportedTokens: JSON.parse(record.supported_tokens) as TokenConfig[],
      createdAt: new Date(record.created_at),
      updatedAt: new Date(record.updated_at),
    };

    const facilitator = createFacilitator(config);

    // Get and decrypt the private key for this facilitator
    let privateKey: Hex | undefined;
    if (record.encrypted_private_key) {
      try {
        privateKey = decryptPrivateKey(record.encrypted_private_key) as Hex;
      } catch (e) {
        console.error('Failed to decrypt private key:', e);
        res.status(500).json({
          success: false,
          errorMessage: 'Failed to decrypt facilitator wallet',
        });
        return;
      }
    } else {
      res.status(400).json({
        success: false,
        errorMessage: 'Facilitator wallet not configured. Please set up a wallet in the dashboard.',
      });
      return;
    }

    const result = await facilitator.settle(paymentPayload, paymentRequirements, privateKey);

    // Parse payload to get from address
    const decoded = Buffer.from(paymentPayload, 'base64').toString('utf-8');
    const parsedPayload = JSON.parse(decoded);
    
    // Log the settlement attempt
    const transaction = createTransaction({
      facilitator_id: record.id,
      type: 'settle',
      network: paymentRequirements.network,
      from_address: parsedPayload.authorization?.from || 'unknown',
      to_address: record.owner_address,
      amount: paymentRequirements.maxAmountRequired,
      asset: paymentRequirements.asset,
      status: result.success ? 'pending' : 'failed',
      transaction_hash: result.transactionHash,
      error_message: result.errorMessage,
    });

    if (result.success && transaction) {
      // Update to success after transaction is confirmed
      // TODO: Implement transaction confirmation monitoring
      updateTransactionStatus(transaction.id, 'success');
    }

    res.json(result);
  } catch (error) {
    console.error('Settle error:', error);
    res.status(500).json({
      success: false,
      errorMessage: 'Internal server error',
    });
  }
});

export { router as facilitatorRouter };

