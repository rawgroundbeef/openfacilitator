// Main client
export { OpenFacilitator, createDefaultFacilitator } from './client.js';

// Types
export type {
  FacilitatorConfig,
  PaymentPayload,
  PaymentAuthorization,
  PaymentRequirements,
  VerifyResponse,
  SettleResponse,
  SupportedResponse,
  PaymentKind,
  NetworkType,
  NetworkInfo,
} from './types.js';

// Errors
export {
  FacilitatorError,
  NetworkError,
  VerificationError,
  SettlementError,
  ConfigurationError,
} from './errors.js';

// Network utilities
export {
  NETWORKS,
  getNetwork,
  getNetworkType,
  toV1NetworkId,
  toV2NetworkId,
  isValidNetwork,
  getMainnets,
  getTestnets,
} from './networks.js';

// Utils
export { isPaymentPayload } from './utils.js';

// Claims
export {
  reportFailure,
  getClaimable,
  getClaimHistory,
  executeClaim,
  type ReportFailureParams,
  type ReportFailureResponse,
  type GetClaimableParams,
  type ClaimableItem,
  type GetClaimableResponse,
  type ClaimHistoryItem,
  type GetClaimHistoryResponse,
  type ExecuteClaimParams,
  type ExecuteClaimResponse,
} from './claims.js';

// Middleware
export {
  // Core wrapper
  withRefundProtection,
  createPaymentContext,
  // Express middleware
  createPaymentMiddleware,
  createRefundMiddleware,
  // Hono middleware
  honoPaymentMiddleware,
  honoRefundMiddleware,
  // Types
  type RefundProtectionConfig,
  type PaymentContext,
  type PaymentRequest,
  type PaymentMiddlewareConfig,
  type HonoRefundConfig,
  type HonoPaymentConfig,
} from './middleware.js';
