import { Router, type Request, type Response, type IRouter } from 'express';
import { createFacilitator, type FacilitatorConfig, type TokenConfig, getSolanaPublicKey, networkToCaip2 } from '@openfacilitator/core';
import { z } from 'zod';
import { requireFacilitator } from '../middleware/tenant.js';
import { createTransaction, updateTransactionStatus } from '../db/transactions.js';
import { getFacilitatorById } from '../db/facilitators.js';
import {
  getPaymentLinkById,
  createPaymentLinkPayment,
  updatePaymentLinkPaymentStatus,
} from '../db/payment-links.js';
import { decryptPrivateKey } from '../utils/crypto.js';
import { sendSettlementWebhook, deliverWebhook, generateWebhookSecret } from '../services/webhook.js';
import type { Hex } from 'viem';

const router: IRouter = Router();

// Payment requirements schema (shared)
const paymentRequirementsSchema = z.object({
  scheme: z.string(),
  network: z.string(),
  maxAmountRequired: z.string(),
  resource: z.string().default(''),
  asset: z.string(), // Token contract address
  payTo: z.string().optional(),
  description: z.string().optional(),
  mimeType: z.string().optional(),
  maxTimeoutSeconds: z.number().optional(),
  outputSchema: z.record(z.unknown()).optional(),
  extra: z.record(z.unknown()).optional(),
});

// Validation schemas - accept both string (base64) and object for paymentPayload
const verifyRequestSchema = z.object({
  x402Version: z.number().optional(), // Some clients omit this
  paymentPayload: z.union([z.string(), z.object({}).passthrough()]),
  paymentRequirements: paymentRequirementsSchema,
});

const settleRequestSchema = verifyRequestSchema;

/**
 * Normalize paymentPayload to string format
 * Accepts both base64 string and object, returns string
 */
function normalizePaymentPayload(payload: string | object): string {
  if (typeof payload === 'string') {
    return payload;
  }
  // If it's an object, base64 encode it
  return Buffer.from(JSON.stringify(payload)).toString('base64');
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
 * GET /favicon.ico - Serve facilitator's custom favicon (or default)
 */
router.get('/favicon.ico', requireFacilitator, (req: Request, res: Response) => {
  const record = req.facilitator!;

  if (record.favicon) {
    // Decode base64 favicon and serve it
    const isDataUrl = record.favicon.startsWith('data:');
    let mimeType = 'image/x-icon';
    let base64Data = record.favicon;

    if (isDataUrl) {
      // Extract mime type and data from data URL
      const match = record.favicon.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        base64Data = match[2];
      }
    }

    const buffer = Buffer.from(base64Data, 'base64');
    res.set('Content-Type', mimeType);
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 1 day
    res.send(buffer);
    return;
  }

  // No custom favicon - redirect to default or serve a default
  // Serve the OpenFacilitator default favicon
  res.redirect('https://openfacilitator.io/favicon.ico');
});

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

  // Build signers object with namespace prefixes
  const signers: Record<string, string[]> = {};

  // Add EVM signer address if available
  if (record.owner_address) {
    signers['eip155:*'] = [record.owner_address];
  }

  // Add feePayer for Solana networks and build signers
  if (record.encrypted_solana_private_key) {
    try {
      const solanaPrivateKey = decryptPrivateKey(record.encrypted_solana_private_key);
      const solanaFeePayer = getSolanaPublicKey(solanaPrivateKey);

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

    // Normalize payload - accept both string and object format
    const paymentPayload = normalizePaymentPayload(parsed.data.paymentPayload);
    const { paymentRequirements } = parsed.data;
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

    // Normalize payload - accept both string and object format
    const paymentPayload = normalizePaymentPayload(parsed.data.paymentPayload);
    const { paymentRequirements } = parsed.data;
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

    // Determine which private key to use based on network (supports both v1 and CAIP-2 formats)
    const isSolana = isSolanaNetwork(paymentRequirements.network);
    
    let privateKey: string | undefined;
    
    if (isSolana) {
      // Use Solana wallet for Solana networks
      if (record.encrypted_solana_private_key) {
        try {
          privateKey = decryptPrivateKey(record.encrypted_solana_private_key);
        } catch (e) {
          console.error('Failed to decrypt Solana private key:', e);
          res.status(500).json({
            success: false,
            errorMessage: 'Failed to decrypt Solana wallet',
          });
          return;
        }
      } else {
        res.status(400).json({
          success: false,
          errorMessage: 'Solana wallet not configured. Please set up a Solana wallet in the dashboard.',
        });
        return;
      }
    } else {
      // Use EVM wallet for EVM networks (Base, Ethereum, etc.)
      if (record.encrypted_private_key) {
        try {
          privateKey = decryptPrivateKey(record.encrypted_private_key);
        } catch (e) {
          console.error('Failed to decrypt EVM private key:', e);
          res.status(500).json({
            success: false,
            errorMessage: 'Failed to decrypt EVM wallet',
          });
          return;
        }
      } else {
        res.status(400).json({
          success: false,
          errorMessage: 'EVM wallet not configured. Please set up an EVM wallet in the dashboard.',
        });
        return;
      }
    }

    const result = await facilitator.settle(paymentPayload, paymentRequirements, privateKey);

    // Parse payload to get from address
    const decoded = Buffer.from(paymentPayload, 'base64').toString('utf-8');
    const parsedPayload = JSON.parse(decoded);
    
    // Extract from_address based on network type
    // Handle both flat and nested payload structures
    let fromAddress = 'unknown';
    if (isSolana) {
      // For Solana, the payer is the fee payer - use payTo from requirements as fallback
      // In x402, the payer signs the transaction, we don't have direct access to their address
      // Use the configured feePayer or payTo as identifier
      fromAddress = paymentRequirements.payTo || 'solana-payer';
    } else {
      // For EVM, use authorization.from - handle both nested and flat formats
      // Format 1: { authorization: { from: ... } }
      // Format 2: { payload: { authorization: { from: ... } } }
      const authorization = parsedPayload.authorization || parsedPayload.payload?.authorization;
      fromAddress = authorization?.from || 'unknown';
    }
    
    // Log the settlement attempt
    const transaction = createTransaction({
      facilitator_id: record.id,
      type: 'settle',
      network: paymentRequirements.network,
      from_address: fromAddress,
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

      // Send webhook notification (fire and forget)
      if (record.webhook_url && record.webhook_secret) {
        sendSettlementWebhook(
          record.webhook_url,
          record.webhook_secret,
          record.id,
          {
            id: transaction.id,
            fromAddress: fromAddress,
            toAddress: record.owner_address,
            amount: paymentRequirements.maxAmountRequired,
            asset: paymentRequirements.asset,
            network: paymentRequirements.network,
            transactionHash: result.transactionHash || null,
          }
        );
      }
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

// ============= PAYMENT LINKS PUBLIC ROUTES =============
// Note: These routes do NOT use requireFacilitator middleware
// because they need to work on localhost (no subdomain).
// Instead, we look up the facilitator from the payment link.

/**
 * GET /pay/:linkId - Serve the payment page
 */
router.get('/pay/:linkId', async (req: Request, res: Response) => {
  // Set CSP headers to allow inline scripts and external dependencies
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; connect-src 'self' https://*.openfacilitator.io https://api.mainnet-beta.solana.com https://api.devnet.solana.com https://*.solana.com https://*.helius-rpc.com https://*.helius.xyz https://*.quicknode.com https://cdn.jsdelivr.net; img-src 'self' data:; font-src 'self';"
  );

  const link = getPaymentLinkById(req.params.linkId);

  if (!link) {
    res.status(404).send(`
      <!DOCTYPE html>
      <html><head><title>Not Found</title></head>
      <body style="font-family: system-ui; text-align: center; padding: 50px;">
        <h1>Payment Link Not Found</h1>
        <p>This payment link doesn't exist or has been deleted.</p>
      </body></html>
    `);
    return;
  }

  const record = getFacilitatorById(link.facilitator_id);

  if (!record) {
    res.status(404).send(`
      <!DOCTYPE html>
      <html><head><title>Not Found</title></head>
      <body style="font-family: system-ui; text-align: center; padding: 50px;">
        <h1>Facilitator Not Found</h1>
        <p>The facilitator for this payment link no longer exists.</p>
      </body></html>
    `);
    return;
  }

  if (!link.active) {
    res.status(410).send(`
      <!DOCTYPE html>
      <html><head><title>Inactive</title></head>
      <body style="font-family: system-ui; text-align: center; padding: 50px;">
        <h1>Payment Link Inactive</h1>
        <p>This payment link is no longer active.</p>
      </body></html>
    `);
    return;
  }

  // Format amount for display
  const amountNum = parseFloat(link.amount) / 1e6;
  const formattedAmount = amountNum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Generate the payment page HTML (Stripe-like two-column layout)
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pay ${record.name} - $${formattedAmount}</title>
  <link rel="icon" href="/favicon.ico">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
    }

    /* Left Column - Primary Blue */
    .left-col {
      width: 50%;
      min-height: 100vh;
      background: #0B64F4;
      color: #fff;
      padding: 48px;
      display: flex;
      justify-content: flex-end;
    }
    .left-inner {
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      padding-right: 48px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 48px;
    }
    .brand-logo {
      width: 32px;
      height: 32px;
    }
    .brand-name {
      font-size: 18px;
      font-weight: 600;
      color: rgba(255,255,255,0.9);
    }
    .back-link {
      color: rgba(255,255,255,0.6);
      text-decoration: none;
      font-size: 14px;
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 24px;
    }
    .back-link:hover { color: #fff; }
    .payment-header {
      font-size: 14px;
      color: rgba(255,255,255,0.6);
      margin-bottom: 8px;
    }
    .payment-title {
      font-size: 20px;
      font-weight: 500;
      margin-bottom: 4px;
    }
    .payment-amount {
      font-size: 36px;
      font-weight: 600;
      margin-bottom: 32px;
    }
    .payment-amount span {
      font-size: 18px;
      color: rgba(255,255,255,0.6);
      font-weight: 400;
    }

    .order-summary {
      background: rgba(255,255,255,0.05);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .order-item {
      display: flex;
      align-items: center;
      gap: 16px;
      padding-bottom: 16px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      margin-bottom: 16px;
    }
    .order-icon {
      width: 48px;
      height: 48px;
      border-radius: 8px;
      background: rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .order-icon img {
      width: 32px;
      height: 32px;
      border-radius: 6px;
    }
    .order-details {
      flex: 1;
    }
    .order-name {
      font-weight: 500;
      margin-bottom: 2px;
    }
    .order-desc {
      font-size: 13px;
      color: rgba(255,255,255,0.5);
    }
    .order-price {
      font-weight: 500;
    }
    .order-total {
      display: flex;
      justify-content: space-between;
      font-size: 15px;
    }
    .order-total-label {
      color: rgba(255,255,255,0.7);
    }
    .order-total-value {
      font-weight: 600;
    }

    .network-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255,255,255,0.1);
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 12px;
    }
    .network-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #00d4aa;
    }

    .spacer { flex: 1; }

    .powered-by {
      font-size: 12px;
      color: rgba(255,255,255,0.4);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .powered-by a {
      color: rgba(255,255,255,0.6);
      text-decoration: none;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .powered-by a:hover { color: #fff; }

    /* Right Column - White */
    .right-col {
      width: 50%;
      min-height: 100vh;
      background: #fff;
      color: #1a1a1a;
      padding: 48px;
      display: flex;
    }
    .right-inner {
      width: 100%;
      max-width: 420px;
      display: flex;
      flex-direction: column;
      padding-left: 48px;
    }
    .right-header {
      font-size: 20px;
      font-weight: 600;
      margin-bottom: 32px;
      color: #1a1a1a;
    }

    .wallet-section {
      background: #f7f7f7;
      border-radius: 12px;
      padding: 24px;
      margin-bottom: 24px;
    }
    .wallet-label {
      font-size: 13px;
      color: #666;
      margin-bottom: 12px;
      font-weight: 500;
    }
    .wallet-status {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .wallet-icon {
      width: 40px;
      height: 40px;
      background: #fff;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid #e5e5e5;
    }
    .wallet-address {
      font-family: monospace;
      font-size: 14px;
      color: #333;
    }
    .wallet-placeholder {
      color: #999;
      font-size: 14px;
    }

    .pay-button {
      width: 100%;
      padding: 16px 24px;
      font-size: 16px;
      font-weight: 600;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      background: #0B64F4;
      color: white;
      transition: background 0.2s;
      margin-bottom: 16px;
    }
    .pay-button:hover:not(:disabled) {
      background: #0A5AD8;
    }
    .pay-button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    .status {
      padding: 12px 16px;
      border-radius: 8px;
      font-size: 14px;
      margin-bottom: 16px;
    }
    .status.error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; }
    .status.success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; }
    .status.pending { background: #fffbeb; color: #d97706; border: 1px solid #fde68a; }

    .info-text {
      font-size: 13px;
      color: #666;
      line-height: 1.5;
    }

    .spinner {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Mobile responsive */
    @media (max-width: 768px) {
      body { flex-direction: column; }
      .left-col, .right-col {
        width: 100%;
        min-height: auto;
        padding: 32px 24px;
        justify-content: flex-start;
      }
      .left-inner, .right-inner {
        max-width: 100%;
        padding: 0;
      }
      .left-col { padding-bottom: 24px; }
      .spacer { display: none; }
    }
  </style>
</head>
<body>
  <div class="left-col">
    <div class="left-inner">
      <div class="brand">
        <svg class="brand-logo" viewBox="0 0 180 180" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="180" height="180" rx="24" fill="rgba(255,255,255,0.2)"/>
          <path d="M130 94.9983C130 119.998 112.5 132.498 91.7 139.748C90.6108 140.117 89.4277 140.1 88.35 139.698C67.5 132.498 50 119.998 50 94.9983V59.9983C50 58.6723 50.5268 57.4005 51.4645 56.4628C52.4021 55.5251 53.6739 54.9983 55 54.9983C65 54.9983 77.5 48.9983 86.2 41.3983C87.2593 40.4933 88.6068 39.9961 90 39.9961C91.3932 39.9961 92.7407 40.4933 93.8 41.3983C102.55 49.0483 115 54.9983 125 54.9983C126.326 54.9983 127.598 55.5251 128.536 56.4628C129.473 57.4005 130 58.6723 130 59.9983V94.9983Z" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M75 90L85 100L105 80" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        <span class="brand-name">OpenFacilitator</span>
      </div>

    <div class="payment-header">Pay ${record.name}</div>
    <div class="payment-title">${link.name}</div>
    <div class="payment-amount">$${formattedAmount} <span>USDC</span></div>

    <div class="order-summary">
      <div class="order-item">
        <div class="order-icon">
          <img src="/favicon.ico" alt="" onerror="this.parentElement.innerHTML='<svg width=\\'24\\' height=\\'24\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\'><rect width=\\'24\\' height=\\'24\\' rx=\\'4\\' fill=\\'#635bff\\'/><path d=\\'M12 6L16 9V15L12 18L8 15V9L12 6Z\\' stroke=\\'white\\' stroke-width=\\'1.5\\' fill=\\'none\\'/></svg>'">
        </div>
        <div class="order-details">
          <div class="order-name">${link.name}</div>
          <div class="order-desc">${link.description || 'One-time payment'}</div>
        </div>
        <div class="order-price">$${formattedAmount}</div>
      </div>
      <div class="order-total">
        <span class="order-total-label">Total due today</span>
        <span class="order-total-value">$${formattedAmount}</span>
      </div>
    </div>

    <div class="network-badge">
      <span class="network-dot"></span>
      ${link.network.charAt(0).toUpperCase() + link.network.slice(1)} Network
    </div>

    <div class="spacer"></div>

    <div class="powered-by">
      Powered by
      <a href="https://openfacilitator.io" target="_blank">
        <svg width="16" height="16" viewBox="0 0 180 180" fill="none"><rect width="180" height="180" rx="24" fill="rgba(255,255,255,0.3)"/><path d="M130 94.9983C130 119.998 112.5 132.498 91.7 139.748C90.6108 140.117 89.4277 140.1 88.35 139.698C67.5 132.498 50 119.998 50 94.9983V59.9983C50 58.6723 50.5268 57.4005 51.4645 56.4628C52.4021 55.5251 53.6739 54.9983 55 54.9983C65 54.9983 77.5 48.9983 86.2 41.3983C87.2593 40.4933 88.6068 39.9961 90 39.9961C91.3932 39.9961 92.7407 40.4933 93.8 41.3983C102.55 49.0483 115 54.9983 125 54.9983C126.326 54.9983 127.598 55.5251 128.536 56.4628C129.473 57.4005 130 58.6723 130 59.9983V94.9983Z" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M75 90L85 100L105 80" stroke="white" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>
        OpenFacilitator
      </a>
      <span style="color: rgba(255,255,255,0.3);">|</span>
      <a href="https://github.com/rawgroundbeef/openfacilitator" target="_blank" title="View source on GitHub">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="rgba(255,255,255,0.6)"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
        Open Source
      </a>
    </div>
    </div>
  </div>

  <div class="right-col">
    <div class="right-inner">
      <div class="right-header">Pay with crypto</div>

      <div class="wallet-section">
        <div class="wallet-label">Wallet</div>
        <div class="wallet-status" id="walletStatus">
          <div class="wallet-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#666" stroke-width="2"><rect x="2" y="6" width="20" height="14" rx="2"/><path d="M16 14a2 2 0 100-4 2 2 0 000 4z"/></svg>
          </div>
          <span class="wallet-placeholder">No wallet connected</span>
        </div>
      </div>

      <div id="status" class="status" style="display: none;"></div>

      <button id="payButton" class="pay-button">
        Connect Wallet
      </button>

      <p class="info-text">
        You'll be asked to connect your wallet and sign a payment authorization.
        The payment will be processed on the ${link.network.charAt(0).toUpperCase() + link.network.slice(1)} network using USDC.
      </p>
    </div>
  </div>

  <script>
    const LINK_ID = '${link.id}';
    const AMOUNT = '${link.amount}';
    const ASSET = '${link.asset}';
    const NETWORK = '${link.network}';
    const SUCCESS_REDIRECT = ${link.success_redirect_url ? `'${link.success_redirect_url}'` : 'null'};
    const IS_SOLANA = NETWORK === 'solana' || NETWORK === 'solana-devnet' || NETWORK.startsWith('solana:');

    function showStatus(message, type) {
      const el = document.getElementById('status');
      el.textContent = message;
      el.className = 'status ' + type;
      el.style.display = 'block';
    }

    let connectedAddress = null;

    function setLoading(loading, text) {
      const btn = document.getElementById('payButton');
      btn.disabled = loading;
      if (loading) {
        btn.innerHTML = '<span class="spinner"></span>' + (text || 'Processing...');
      } else if (connectedAddress) {
        btn.innerHTML = 'Pay $${formattedAmount}';
      } else {
        btn.innerHTML = 'Connect Wallet';
      }
    }

    function updateWalletUI(address) {
      const walletStatus = document.getElementById('walletStatus');
      if (address) {
        const short = address.slice(0, 6) + '...' + address.slice(-4);
        walletStatus.innerHTML = \`
          <div class="wallet-icon" style="background: #f0fdf4; border-color: #bbf7d0;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <span class="wallet-address">\${short}</span>
        \`;
      }
    }

    // Solana wallet detection
    function getSolanaWallet() {
      if (window.phantom?.solana?.isPhantom) return window.phantom.solana;
      if (window.solana?.isPhantom) return window.solana;
      if (window.solflare?.isSolflare) return window.solflare;
      return null;
    }

    async function connectAndPaySolana() {
      try {
        const wallet = getSolanaWallet();
        if (!wallet) {
          showStatus('Please install Phantom or another Solana wallet', 'error');
          return;
        }

        setLoading(true, 'Connecting...');

        // Connect to wallet
        const resp = await wallet.connect();
        const userPublicKey = resp.publicKey.toString();
        connectedAddress = userPublicKey;
        updateWalletUI(userPublicKey);

        setLoading(true, 'Preparing payment...');

        // Get payment requirements
        const reqRes = await fetch('/pay/' + LINK_ID + '/requirements');
        if (!reqRes.ok) throw new Error('Failed to get payment requirements');
        const { paymentRequirements, facilitatorUrl, solanaRpcUrl } = await reqRes.json();

        // Get USDC mint and recipient from requirements
        const usdcMint = ASSET;
        const recipientAddress = paymentRequirements.payTo;
        const feePayer = paymentRequirements.extra?.feePayer;

        if (!feePayer) {
          throw new Error('Facilitator fee payer not configured');
        }

        // Use Solana web3.js via CDN for transaction building
        // We need to dynamically load it
        if (!window.solanaWeb3) {
          setLoading(true, 'Loading Solana libraries...');
          await loadSolanaLibs();
        }

        const { Connection, PublicKey, Transaction, SystemProgram } = window.solanaWeb3;
        const { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction, getAccount } = window.splToken;

        // Connect to Solana RPC
        const rpcUrl = solanaRpcUrl || 'https://api.mainnet-beta.solana.com';
        const connection = new Connection(rpcUrl, 'confirmed');

        // Get recent blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

        // Get token accounts
        const senderPubkey = new PublicKey(userPublicKey);
        const recipientPubkey = new PublicKey(recipientAddress);
        const feePayerPubkey = new PublicKey(feePayer);
        const mintPubkey = new PublicKey(usdcMint);

        const senderATA = await getAssociatedTokenAddress(mintPubkey, senderPubkey);
        const recipientATA = await getAssociatedTokenAddress(mintPubkey, recipientPubkey);

        // Build transaction
        const transaction = new Transaction();
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = feePayerPubkey; // Facilitator pays fees

        // Check if recipient ATA exists, create if not
        try {
          await getAccount(connection, recipientATA);
        } catch {
          // Add instruction to create recipient's ATA
          transaction.add(
            createAssociatedTokenAccountInstruction(
              feePayerPubkey,  // payer
              recipientATA,    // ata
              recipientPubkey, // owner
              mintPubkey       // mint
            )
          );
        }

        // Add transfer instruction
        transaction.add(
          createTransferInstruction(
            senderATA,                    // source
            recipientATA,                 // destination
            senderPubkey,                 // owner
            BigInt(AMOUNT)                // amount (atomic units)
          )
        );

        setLoading(true, 'Waiting for signature...');

        // Sign with user's wallet (partial sign - fee payer will sign on backend)
        const signedTransaction = await wallet.signTransaction(transaction);

        // Serialize the transaction
        const serializedTx = signedTransaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false
        });
        const signedTxBase64 = btoa(String.fromCharCode(...serializedTx));

        // Build payment payload for Solana
        const paymentPayload = {
          x402Version: 1,
          scheme: 'exact',
          network: NETWORK,
          payload: {
            transaction: signedTxBase64
          }
        };

        setLoading(true, 'Processing payment...');

        // Submit to facilitator
        const settleRes = await fetch(facilitatorUrl + '/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            x402Version: 1,
            paymentPayload: btoa(JSON.stringify(paymentPayload)),
            paymentRequirements
          })
        });

        const settleResult = await settleRes.json();

        if (settleResult.success) {
          // Record the payment
          await fetch('/pay/' + LINK_ID + '/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payerAddress: userPublicKey,
              transactionHash: settleResult.transactionHash
            })
          });

          showStatus('Payment successful!', 'success');

          if (SUCCESS_REDIRECT) {
            setTimeout(() => { window.location.href = SUCCESS_REDIRECT; }, 2000);
          }
        } else {
          throw new Error(settleResult.errorMessage || 'Payment failed');
        }
      } catch (err) {
        console.error('Payment error:', err);
        showStatus(err.message || 'Payment failed', 'error');
      } finally {
        setLoading(false);
      }
    }

    async function loadSolanaLibs() {
      // Load Solana web3.js from jsDelivr
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@solana/web3.js@1.95.3/lib/index.iife.min.js';
        script.onload = () => {
          console.log('Solana web3.js loaded');
          resolve();
        };
        script.onerror = (e) => {
          console.error('Failed to load Solana web3.js:', e);
          reject(new Error('Failed to load Solana web3.js'));
        };
        document.head.appendChild(script);
      });

      // SPL Token program IDs
      const TOKEN_PROGRAM_ID = new window.solanaWeb3.PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
      const ASSOCIATED_TOKEN_PROGRAM_ID = new window.solanaWeb3.PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');

      // Implement SPL Token functions inline (no external dependency needed)
      window.splToken = {
        TOKEN_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,

        // Get associated token address (PDA derivation)
        getAssociatedTokenAddress: async function(mint, owner) {
          const [address] = await window.solanaWeb3.PublicKey.findProgramAddress(
            [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
            ASSOCIATED_TOKEN_PROGRAM_ID
          );
          return address;
        },

        // Create transfer instruction
        createTransferInstruction: function(source, destination, owner, amount) {
          const keys = [
            { pubkey: source, isSigner: false, isWritable: true },
            { pubkey: destination, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: true, isWritable: false }
          ];
          // Transfer instruction = index 3, followed by u64 amount (little endian)
          const data = new Uint8Array(9);
          data[0] = 3; // Transfer instruction
          const amountBigInt = BigInt(amount);
          for (let i = 0; i < 8; i++) {
            data[1 + i] = Number((amountBigInt >> BigInt(i * 8)) & BigInt(0xff));
          }
          return new window.solanaWeb3.TransactionInstruction({
            keys,
            programId: TOKEN_PROGRAM_ID,
            data: data
          });
        },

        // Create associated token account instruction
        createAssociatedTokenAccountInstruction: function(payer, associatedToken, owner, mint) {
          const keys = [
            { pubkey: payer, isSigner: true, isWritable: true },
            { pubkey: associatedToken, isSigner: false, isWritable: true },
            { pubkey: owner, isSigner: false, isWritable: false },
            { pubkey: mint, isSigner: false, isWritable: false },
            { pubkey: window.solanaWeb3.SystemProgram.programId, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }
          ];
          return new window.solanaWeb3.TransactionInstruction({
            keys,
            programId: ASSOCIATED_TOKEN_PROGRAM_ID,
            data: new Uint8Array(0)
          });
        },

        // Check if token account exists
        getAccount: async function(connection, address) {
          const info = await connection.getAccountInfo(address);
          if (!info) throw new Error('Account not found');
          return info;
        }
      };

      console.log('SPL Token helpers initialized');
    }

    async function connectAndPayEVM() {
      try {
        // Check for wallet
        if (!window.ethereum) {
          showStatus('Please install MetaMask or another Web3 wallet', 'error');
          return;
        }

        setLoading(true, 'Connecting...');

        // Request account access
        const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
        const userAddress = accounts[0];
        connectedAddress = userAddress;
        updateWalletUI(userAddress);

        setLoading(true, 'Preparing payment...');

        // Get payment requirements
        const reqRes = await fetch('/pay/' + LINK_ID + '/requirements');
        if (!reqRes.ok) throw new Error('Failed to get payment requirements');
        const { paymentRequirements, facilitatorUrl } = await reqRes.json();

        // Create ERC-3009 authorization
        const deadline = Math.floor(Date.now() / 1000) + 3600;
        const nonce = '0x' + [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2,'0')).join('');

        // The domain and types for ERC-3009 TransferWithAuthorization
        const domain = {
          name: 'USD Coin',
          version: '2',
          chainId: NETWORK === 'base' ? 8453 : 84532,
          verifyingContract: ASSET
        };

        const types = {
          TransferWithAuthorization: [
            { name: 'from', type: 'address' },
            { name: 'to', type: 'address' },
            { name: 'value', type: 'uint256' },
            { name: 'validAfter', type: 'uint256' },
            { name: 'validBefore', type: 'uint256' },
            { name: 'nonce', type: 'bytes32' }
          ]
        };

        const message = {
          from: userAddress,
          to: paymentRequirements.payTo,
          value: AMOUNT,
          validAfter: 0,
          validBefore: deadline,
          nonce: nonce
        };

        setLoading(true, 'Waiting for signature...');

        // Sign with EIP-712
        const signature = await window.ethereum.request({
          method: 'eth_signTypedData_v4',
          params: [userAddress, JSON.stringify({ domain, types, primaryType: 'TransferWithAuthorization', message })]
        });

        // Build payment payload
        const paymentPayload = {
          x402Version: 1,
          scheme: 'exact',
          network: paymentRequirements.network,
          payload: {
            signature,
            authorization: {
              from: userAddress,
              to: paymentRequirements.payTo,
              value: AMOUNT,
              validAfter: '0',
              validBefore: String(deadline),
              nonce: nonce
            }
          }
        };

        setLoading(true, 'Processing payment...');

        // Submit to facilitator
        const settleRes = await fetch(facilitatorUrl + '/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            x402Version: 1,
            paymentPayload: btoa(JSON.stringify(paymentPayload)),
            paymentRequirements
          })
        });

        const settleResult = await settleRes.json();

        if (settleResult.success) {
          // Record the payment
          await fetch('/pay/' + LINK_ID + '/complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              payerAddress: userAddress,
              transactionHash: settleResult.transactionHash
            })
          });

          showStatus('Payment successful!', 'success');

          if (SUCCESS_REDIRECT) {
            setTimeout(() => { window.location.href = SUCCESS_REDIRECT; }, 2000);
          }
        } else {
          throw new Error(settleResult.errorMessage || 'Payment failed');
        }
      } catch (err) {
        console.error('Payment error:', err);
        showStatus(err.message || 'Payment failed', 'error');
      } finally {
        setLoading(false);
      }
    }

    function connectAndPay() {
      if (IS_SOLANA) {
        connectAndPaySolana();
      } else {
        connectAndPayEVM();
      }
    }

    // Attach event listener (CSP-safe, no inline onclick)
    document.getElementById('payButton').addEventListener('click', connectAndPay);
  </script>
</body>
</html>`;

  res.type('html').send(html);
});

/**
 * GET /pay/:linkId/requirements - Get payment requirements for a payment link
 */
router.get('/pay/:linkId/requirements', async (req: Request, res: Response) => {
  const link = getPaymentLinkById(req.params.linkId);

  if (!link) {
    res.status(404).json({ error: 'Payment link not found' });
    return;
  }

  const record = getFacilitatorById(link.facilitator_id);

  if (!record) {
    res.status(404).json({ error: 'Facilitator not found' });
    return;
  }

  if (!link.active) {
    res.status(410).json({ error: 'Payment link is inactive' });
    return;
  }

  // Build facilitator URL
  const facilitatorUrl = record.custom_domain
    ? `https://${record.custom_domain}`
    : `https://${record.subdomain}.openfacilitator.io`;

  // Check if this is a Solana network
  const isSolanaNetwork = link.network === 'solana' ||
                          link.network === 'solana-mainnet' ||
                          link.network === 'solana-devnet' ||
                          link.network.startsWith('solana:');

  // Build payment requirements - payments go to link's pay_to_address (not facilitator wallet)
  const paymentRequirements: Record<string, unknown> = {
    scheme: 'exact',
    network: link.network,
    maxAmountRequired: link.amount,
    asset: link.asset,
    payTo: link.pay_to_address, // Payments go to user-specified address
    description: link.description || link.name,
  };

  // For Solana, we also need the fee payer (facilitator's Solana wallet pays gas)
  let solanaRpcUrl: string | undefined;
  if (isSolanaNetwork && record.encrypted_solana_private_key) {
    try {
      const solanaPrivateKey = decryptPrivateKey(record.encrypted_solana_private_key);
      const solanaFeePayer = getSolanaPublicKey(solanaPrivateKey);
      // Fee payer is the facilitator wallet (pays gas), but payTo is the link's address (receives funds)
      paymentRequirements.extra = { feePayer: solanaFeePayer };

      // Provide RPC URL for frontend
      solanaRpcUrl = link.network === 'solana-devnet'
        ? (process.env.SOLANA_DEVNET_RPC_URL || 'https://api.devnet.solana.com')
        : (process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
    } catch (e) {
      console.error('Failed to get Solana fee payer:', e);
      res.status(500).json({ error: 'Solana wallet not configured properly' });
      return;
    }
  } else if (isSolanaNetwork) {
    res.status(500).json({ error: 'Solana wallet not configured for this facilitator' });
    return;
  }

  res.json({
    paymentRequirements,
    facilitatorUrl,
    ...(solanaRpcUrl && { solanaRpcUrl }),
  });
});

/**
 * POST /pay/:linkId/complete - Record a completed payment
 */
router.post('/pay/:linkId/complete', async (req: Request, res: Response) => {
  const link = getPaymentLinkById(req.params.linkId);

  if (!link) {
    res.status(404).json({ error: 'Payment link not found' });
    return;
  }

  const record = getFacilitatorById(link.facilitator_id);

  if (!record) {
    res.status(404).json({ error: 'Facilitator not found' });
    return;
  }

  const { payerAddress, transactionHash, errorMessage } = req.body;

  if (!payerAddress) {
    res.status(400).json({ error: 'Payer address is required' });
    return;
  }

  // Create payment record
  const payment = createPaymentLinkPayment({
    payment_link_id: link.id,
    payer_address: payerAddress,
    amount: link.amount,
    transaction_hash: transactionHash,
    status: transactionHash ? 'success' : 'failed',
    error_message: errorMessage,
  });

  // Fire webhook - use link's webhook if configured, otherwise fall back to facilitator's
  const webhookUrl = link.webhook_url || record.webhook_url;
  const webhookSecret = link.webhook_secret || record.webhook_secret;

  if (webhookUrl && webhookSecret && transactionHash) {
    const webhookPayload = {
      event: 'payment_link.payment' as const,
      facilitatorId: record.id,
      paymentLinkId: link.id,
      paymentLinkName: link.name,
      timestamp: new Date().toISOString(),
      payment: {
        id: payment.id,
        payerAddress,
        amount: link.amount,
        asset: link.asset,
        network: link.network,
        transactionHash,
      },
    };

    // Fire and forget
    deliverWebhook(webhookUrl, webhookSecret, webhookPayload, 3).catch((err) => {
      console.error('Payment link webhook delivery failed:', err);
    });
  }

  res.json({
    success: true,
    paymentId: payment.id,
  });
});

export { router as facilitatorRouter };

