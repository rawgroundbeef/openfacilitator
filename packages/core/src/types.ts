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
 * Verification response
 */
export interface VerifyResponse {
  valid: boolean;
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
 * Settlement response
 */
export interface SettleResponse {
  success: boolean;
  transactionHash?: string;
  errorMessage?: string;
  network?: string;
}

/**
 * Supported tokens/chains response
 */
export interface SupportedResponse {
  x402Version: number;
  kinds: SupportedKind[];
}

/**
 * A supported payment kind (network + token combination)
 */
export interface SupportedKind {
  scheme: string;
  network: string;
  asset: string;
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
