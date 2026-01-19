import type { Address, Hex } from 'viem';

/**
 * Chain ID can be number (EVM) or string (non-EVM like Solana)
 */
export type ChainId = number | string;

/**
 * Supported blockchain network configuration
 */
export interface ChainConfig {
  chainId: ChainId;
  name: string;
  network: string;
  rpcUrl: string;
  blockExplorerUrl?: string;
  isEVM: boolean;
}

/**
 * Token configuration for a specific chain
 */
export interface TokenConfig {
  address: string; // Address for EVM, mint address for Solana
  symbol: string;
  decimals: number;
  chainId: ChainId;
}

/**
 * Optional nonce validator interface for persistent replay protection
 * Allows external systems (like the server) to inject persistent nonce tracking
 */
export interface NonceValidator {
  tryAcquire(params: {
    nonce: string;
    from: string;
    chainId: number;
    expiresAt: number;
  }): { acquired: boolean; reason?: string } | Promise<{ acquired: boolean; reason?: string }>;
  release?(nonce: string, from: string, chainId: number): void;
  markSettled?(nonce: string, from: string, chainId: number, txHash: string): void;
}

/**
 * Facilitator configuration
 */
export interface FacilitatorConfig {
  id: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  ownerAddress: string;
  supportedChains: ChainId[];
  supportedTokens: TokenConfig[];
  createdAt: Date;
  updatedAt: Date;
  /** Optional nonce validator for persistent replay protection */
  nonceValidator?: NonceValidator;
}

/**
 * x402 Payment header structure
 */
export interface X402PaymentHeader {
  version: string;
  scheme: string;
  network: string;
  payload: X402PaymentPayload;
}

/**
 * x402 Payment payload
 */
export interface X402PaymentPayload {
  signature: Hex | string;
  authorization: {
    from: string;
    to: string;
    value: string;
    validAfter: number;
    validBefore: number;
    nonce: Hex | string;
  };
}

/**
 * Verification request body
 */
export interface VerifyRequest {
  x402Version: number;
  paymentPayload: string;
  paymentRequirements: PaymentRequirements;
}

/**
 * Payment requirements from the resource server
 */
export interface PaymentRequirements {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  asset: string; // Token contract address
  description?: string;
  mimeType?: string;
  outputSchema?: Record<string, unknown>;
  extra?: Record<string, unknown>;
}

/**
 * Verification response (x402 standard format)
 */
export interface VerifyResponse {
  isValid: boolean;
  invalidReason?: string;
  payer?: string;
}

/**
 * Settlement request body
 */
export interface SettleRequest {
  x402Version: number;
  paymentPayload: string;
  paymentRequirements: PaymentRequirements;
}

/**
 * Settlement response (x402 standard format)
 */
export interface SettleResponse {
  success: boolean;
  transaction: string;  // Transaction hash, empty string "" when failed
  payer: string;        // Payer address
  network: string;      // Network identifier
  errorReason?: string; // Error reason when success is false
}

/**
 * Supported tokens/chains response (PayAI format)
 */
export interface SupportedResponse {
  kinds: SupportedKind[];
  extensions?: string[];
  signers?: Record<string, string[]>;
}

/**
 * A supported payment kind (network + token combination)
 */
export interface SupportedKind {
  x402Version: number;
  scheme: string;
  network: string;
  asset?: string;
  extra?: Record<string, unknown>;
}

/**
 * Transaction record for history tracking
 */
export interface TransactionRecord {
  id: string;
  facilitatorId: string;
  type: 'verify' | 'settle';
  network: string;
  fromAddress: string;
  toAddress: string;
  amount: string;
  asset: string;
  transactionHash?: string;
  status: 'pending' | 'success' | 'failed';
  errorMessage?: string;
  createdAt: Date;
}

// ============================================
// Multi-Settle Types
// ============================================

/**
 * Multi-settle authorization request
 * The user signs a spending cap that can be settled multiple times
 */
export interface MultiSettleAuthorizationRequest {
  x402Version?: number;
  paymentPayload: string | object;
  paymentRequirements: PaymentRequirements;
  /** The total spending cap (e.g., "5000000" for $5 USDC) */
  capAmount: string;
  /** Unix timestamp when this authorization expires */
  validUntil: number;
}

/**
 * Multi-settle authorization response
 */
export interface MultiSettleAuthorizationResponse {
  success: boolean;
  /** Unique identifier for this multi-settle authorization */
  authorizationId?: string;
  /** The original cap amount */
  capAmount?: string;
  /** Current remaining amount */
  remainingAmount?: string;
  /** Unix timestamp when this expires */
  validUntil?: number;
  /** The nonce from the signature */
  nonce?: string;
  errorMessage?: string;
}

/**
 * Multi-settle settlement request
 */
export interface MultiSettleSettlementRequest {
  /** The authorization ID returned from the authorize endpoint */
  authorizationId: string;
  /** The recipient address for this settlement */
  payTo: string;
  /** The amount to settle in this transaction */
  amount: string;
}

/**
 * Multi-settle settlement response
 */
export interface MultiSettleSettlementResponse {
  success: boolean;
  /** Transaction hash if settled on-chain */
  transactionHash?: string;
  /** Remaining amount after this settlement */
  remainingAmount?: string;
  /** Network the transaction was settled on */
  network?: string;
  errorMessage?: string;
}

/**
 * Multi-settle status check response
 */
export interface MultiSettleStatusResponse {
  authorizationId: string;
  status: 'active' | 'exhausted' | 'expired' | 'revoked';
  network: string;
  asset: string;
  fromAddress: string;
  capAmount: string;
  remainingAmount: string;
  validUntil: number;
  createdAt: string;
  settlements: MultiSettleSettlementSummary[];
}

/**
 * Summary of a settlement in a multi-settle authorization
 */
export interface MultiSettleSettlementSummary {
  id: string;
  payTo: string;
  amount: string;
  transactionHash?: string;
  status: 'pending' | 'success' | 'failed';
  createdAt: string;
}

/**
 * Multi-settle revocation request
 */
export interface MultiSettleRevocationRequest {
  authorizationId: string;
}

/**
 * Multi-settle revocation response
 */
export interface MultiSettleRevocationResponse {
  success: boolean;
  errorMessage?: string;
}
