/**
 * Adapter to bridge the nonce tracker service with the core package's NonceValidator interface
 *
 * This allows the core package to remain independent while using persistent nonce tracking
 * when running in the server environment.
 */

import type { NonceValidator } from '@openfacilitator/core';
import {
  tryAcquireNonce,
  releaseNonce as releaseNonceFromCache,
  markNonceSettled,
  type AcquireNonceParams,
} from './nonce-tracker.js';

/**
 * Create a NonceValidator instance for a specific facilitator
 *
 * @param facilitatorId The facilitator ID to track nonces for
 * @returns NonceValidator that can be injected into settlement operations
 */
export function createNonceValidator(facilitatorId: string): NonceValidator {
  return {
    /**
     * Try to acquire a nonce for settlement
     * Synchronous wrapper around the nonce tracker
     */
    tryAcquire(params: {
      nonce: string;
      from: string;
      chainId: number;
      expiresAt: number;
    }): { acquired: boolean; reason?: string } {
      const acquireParams: AcquireNonceParams = {
        nonce: params.nonce,
        from: params.from,
        chainId: params.chainId,
        facilitatorId,
        expiresAt: params.expiresAt,
      };

      return tryAcquireNonce(acquireParams);
    },

    /**
     * Release a nonce from in-memory cache if settlement fails before submission
     * Note: This only releases from cache, NOT from database
     */
    release(nonce: string, from: string, chainId: number): void {
      releaseNonceFromCache(nonce, from, chainId);
    },

    /**
     * Mark a nonce as successfully settled with transaction hash
     */
    markSettled(nonce: string, from: string, chainId: number, txHash: string): void {
      markNonceSettled(nonce, from, chainId, txHash);
    },
  };
}
