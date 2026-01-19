// ============ Configuration ============

export interface FacilitatorConfig {
  /** Facilitator URL (defaults to https://pay.openfacilitator.io) */
  url?: string;
  /** Optional timeout in ms (default: 30000) */
  timeout?: number;
  /** Optional custom headers */
  headers?: Record<string, string>;
}

// ============ x402 Payment Types ============

/**
 * Payment payload for verification/settlement
 * Supports both x402 v1 and v2 formats
 */
export interface PaymentPayload {
  /** x402 version (1 or 2) */
  x402Version: 1 | 2;
  /** Payment scheme (e.g., "exact") */
  scheme: string;
  /** Network identifier - v1: "base", v2: "eip155:8453" */
  network: string;
  /** Payment details */
  payload: {
    /** Signature of the payment */
    signature: string;
    /** Payment authorization */
    authorization: PaymentAuthorization;
  };
}

export interface PaymentAuthorization {
  /** Sender address */
  from: string;
  /** Recipient address */
  to: string;
  /** Amount in base units (string to handle large numbers) */
  amount: string;
  /** Token/asset address or identifier */
  asset: string;
  /** Chain ID (for EVM) */
  chainId?: number;
  /** Nonce */
  nonce?: string;
  /** Expiration timestamp */
  validUntil?: number;
  /** Additional fields for specific schemes */
  [key: string]: unknown;
}

// ============ Payment Requirements ============

/**
 * Payment requirements from the server/resource
 * Used for validation during verify/settle
 */
export interface PaymentRequirements {
  /** Payment scheme (e.g., "exact") */
  scheme: string;
  /** Network identifier */
  network: string;
  /** Maximum amount required in base units */
  maxAmountRequired: string;
  /** Resource URL being paid for */
  resource?: string;
  /** Token/asset address */
  asset: string;
  /** Recipient address */
  payTo?: string;
  /** Human-readable description */
  description?: string;
  /** MIME type of resource */
  mimeType?: string;
  /** Maximum timeout in seconds */
  maxTimeoutSeconds?: number;
  /** Output schema for structured responses */
  outputSchema?: Record<string, unknown>;
  /** Extra data */
  extra?: Record<string, unknown>;
}

// ============ Response Types ============

export interface VerifyResponse {
  /** Whether the payment is valid */
  isValid: boolean;
  /** Reason if invalid (x402 standard) */
  invalidReason?: string;
  /** Payer address */
  payer?: string;
  /** Additional verification details */
  details?: {
    /** Verified amount */
    amount?: string;
    /** Verified recipient */
    recipient?: string;
    /** Payment scheme used */
    scheme?: string;
  };
}

export interface SettleResponse {
  /** Whether settlement was successful */
  success: boolean;
  /** Transaction hash/signature (empty string when failed, x402 standard) */
  transaction: string;
  /** Payer address (x402 standard) */
  payer: string;
  /** Network the transaction was settled on */
  network: string;
  /** Error reason if failed (x402 standard) */
  errorReason?: string;
}

export interface SupportedResponse {
  /** Supported payment kinds */
  kinds: PaymentKind[];
  /** Signer addresses by network namespace */
  signers?: Record<string, string[]>;
  /** Supported extensions */
  extensions?: string[];
}

export interface PaymentKind {
  /** x402 version */
  x402Version: 1 | 2;
  /** Payment scheme */
  scheme: string;
  /** Network identifier */
  network: string;
  /** Extra data (e.g., feePayer for Solana) */
  extra?: {
    feePayer?: string;
    [key: string]: unknown;
  };
}

// ============ Network Types ============

export type NetworkType = 'evm' | 'solana';

export interface NetworkInfo {
  /** v1 identifier (e.g., "base") */
  v1Id: string;
  /** v2 CAIP-2 identifier (e.g., "eip155:8453") */
  v2Id: string;
  /** Human-readable name */
  name: string;
  /** Network type */
  type: NetworkType;
  /** Chain ID (EVM only) */
  chainId?: number;
  /** Whether this is a testnet */
  testnet: boolean;
}
