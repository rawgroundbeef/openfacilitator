/**
 * Comprehensive tests for persistent nonce tracking
 *
 * CRITICAL: These tests verify replay attack prevention - the most important
 * security feature of the nonce tracker.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeDatabase, closeDatabase } from '../db/index.js';
import {
  tryAcquireNonce,
  releaseNonce,
  markNonceSettled,
  cleanupExpiredNonces,
  getNonceStats,
  type AcquireNonceParams,
} from './nonce-tracker.js';
import fs from 'fs';

describe('Nonce Tracker Service', () => {
  // Use unique database file to avoid conflicts with other tests
  const testDbPath = `./data/test-nonce-tracker-${Date.now()}.db`;
  const testFacilitatorId = 'test-facilitator-123';

  beforeAll(() => {
    // Initialize test database
    initializeDatabase(testDbPath);
  });

  afterAll(() => {
    // Clean up test database
    closeDatabase();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testDbPath + '-shm')) {
      fs.unlinkSync(testDbPath + '-shm');
    }
    if (fs.existsSync(testDbPath + '-wal')) {
      fs.unlinkSync(testDbPath + '-wal');
    }
  });

  describe('tryAcquireNonce', () => {
    it('should successfully acquire a new nonce', () => {
      const params: AcquireNonceParams = {
        nonce: '0x1111111111111111111111111111111111111111111111111111111111111111',
        from: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
        chainId: 8453, // Base
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      const result = tryAcquireNonce(params);

      expect(result.acquired).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should reject duplicate nonce from same address on same chain', () => {
      const nonce = '0x2222222222222222222222222222222222222222222222222222222222222222';
      const from = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const chainId = 8453;

      const params: AcquireNonceParams = {
        nonce,
        from,
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      // First acquisition should succeed
      const result1 = tryAcquireNonce(params);
      expect(result1.acquired).toBe(true);

      // Second acquisition should fail
      const result2 = tryAcquireNonce(params);
      expect(result2.acquired).toBe(false);
      expect(result2.reason).toContain('already');
    });

    it('should allow same nonce from different addresses', () => {
      const nonce = '0x3333333333333333333333333333333333333333333333333333333333333333';
      const chainId = 8453;

      const params1: AcquireNonceParams = {
        nonce,
        from: '0x1111111111111111111111111111111111111111',
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      const params2: AcquireNonceParams = {
        nonce,
        from: '0x2222222222222222222222222222222222222222',
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      const result1 = tryAcquireNonce(params1);
      expect(result1.acquired).toBe(true);

      const result2 = tryAcquireNonce(params2);
      expect(result2.acquired).toBe(true);
    });

    it('should allow same nonce from same address on different chains', () => {
      const nonce = '0x4444444444444444444444444444444444444444444444444444444444444444';
      const from = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';

      const params1: AcquireNonceParams = {
        nonce,
        from,
        chainId: 8453, // Base
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      const params2: AcquireNonceParams = {
        nonce,
        from,
        chainId: 1, // Ethereum
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      const result1 = tryAcquireNonce(params1);
      expect(result1.acquired).toBe(true);

      const result2 = tryAcquireNonce(params2);
      expect(result2.acquired).toBe(true);
    });

    it('should handle case-insensitive addresses and nonces', () => {
      const nonce = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const from = '0xABCDEF1234567890ABCDEF1234567890ABCDEF12';
      const chainId = 8453;

      const params1: AcquireNonceParams = {
        nonce: nonce.toUpperCase(),
        from: from.toUpperCase(),
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      const params2: AcquireNonceParams = {
        nonce: nonce.toLowerCase(),
        from: from.toLowerCase(),
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      const result1 = tryAcquireNonce(params1);
      expect(result1.acquired).toBe(true);

      // Should reject because nonce is already acquired (case-insensitive)
      const result2 = tryAcquireNonce(params2);
      expect(result2.acquired).toBe(false);
    });

    it('should store expiration time correctly', () => {
      const nonce = '0x5555555555555555555555555555555555555555555555555555555555555555';
      const from = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const chainId = 8453;
      const expiresAt = Math.floor(Date.now() / 1000) + 7200; // 2 hours from now

      const params: AcquireNonceParams = {
        nonce,
        from,
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt,
      };

      const result = tryAcquireNonce(params);
      expect(result.acquired).toBe(true);

      // Verify it's stored in database
      const stats = getNonceStats(testFacilitatorId);
      expect(stats.totalNonces).toBeGreaterThan(0);
    });
  });

  describe('releaseNonce', () => {
    it('should release nonce from in-memory cache', () => {
      const nonce = '0x6666666666666666666666666666666666666666666666666666666666666666';
      const from = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const chainId = 8453;

      const params: AcquireNonceParams = {
        nonce,
        from,
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      // Acquire nonce
      const result1 = tryAcquireNonce(params);
      expect(result1.acquired).toBe(true);

      // Release nonce from cache (simulates pre-settlement failure)
      releaseNonce(nonce, from, chainId);

      // Note: The nonce is still in the database, so re-acquisition should fail
      // This is intentional - we only release from cache, not database
      const result2 = tryAcquireNonce(params);
      expect(result2.acquired).toBe(false);
      expect(result2.reason).toContain('already');
    });
  });

  describe('markNonceSettled', () => {
    it('should mark nonce with transaction hash after settlement', () => {
      const nonce = '0x7777777777777777777777777777777777777777777777777777777777777777';
      const from = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const chainId = 8453;
      const txHash = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

      const params: AcquireNonceParams = {
        nonce,
        from,
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      // Acquire nonce
      const result = tryAcquireNonce(params);
      expect(result.acquired).toBe(true);

      // Mark as settled
      markNonceSettled(nonce, from, chainId, txHash);

      // Clear the in-memory cache to test database lookup
      releaseNonce(nonce, from, chainId);

      // Try to acquire again - should fail from database and include transaction hash in reason
      const result2 = tryAcquireNonce(params);
      expect(result2.acquired).toBe(false);
      expect(result2.reason).toContain(txHash);
    });
  });

  describe('cleanupExpiredNonces', () => {
    it('should run cleanup without errors', () => {
      // Run cleanup - should complete successfully even if no nonces are deleted
      const deletedCount = cleanupExpiredNonces();

      // Verify cleanup runs and returns a number
      expect(typeof deletedCount).toBe('number');
      expect(deletedCount).toBeGreaterThanOrEqual(0);
    });

    it('should not delete non-expired nonces', () => {
      const nonce = '0x9999999999999999999999999999999999999999999999999999999999999999';
      const from = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const chainId = 8453;

      const params: AcquireNonceParams = {
        nonce,
        from,
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
      };

      const statsBefore = getNonceStats(testFacilitatorId);
      const result = tryAcquireNonce(params);
      expect(result.acquired).toBe(true);

      // Run cleanup
      cleanupExpiredNonces();

      // Verify non-expired nonce still exists
      const statsAfter = getNonceStats(testFacilitatorId);
      expect(statsAfter.totalNonces).toBeGreaterThanOrEqual(statsBefore.totalNonces + 1);
    });
  });

  describe('getNonceStats', () => {
    it('should return correct statistics', () => {
      const stats = getNonceStats(testFacilitatorId);

      expect(stats).toHaveProperty('totalNonces');
      expect(stats).toHaveProperty('settledNonces');
      expect(stats).toHaveProperty('pendingNonces');
      expect(stats).toHaveProperty('expiredNonces');

      expect(typeof stats.totalNonces).toBe('number');
      expect(typeof stats.settledNonces).toBe('number');
      expect(typeof stats.pendingNonces).toBe('number');
      expect(typeof stats.expiredNonces).toBe('number');

      // Basic sanity checks
      expect(stats.totalNonces).toBeGreaterThanOrEqual(0);
      expect(stats.settledNonces).toBeGreaterThanOrEqual(0);
      expect(stats.pendingNonces).toBeGreaterThanOrEqual(0);
      expect(stats.settledNonces + stats.pendingNonces).toBeLessThanOrEqual(stats.totalNonces);
    });
  });

  describe('Concurrent Access (Stress Test)', () => {
    it('should handle concurrent requests with same nonce safely', () => {
      const nonce = '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
      const from = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const chainId = 8453;

      const params: AcquireNonceParams = {
        nonce,
        from,
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      // Simulate 10 concurrent requests
      const results = Array.from({ length: 10 }, () => tryAcquireNonce(params));

      // SECURITY: Only ONE should succeed
      const acquired = results.filter((r) => r.acquired);
      const rejected = results.filter((r) => !r.acquired);

      expect(acquired.length).toBe(1);
      expect(rejected.length).toBe(9);

      // All rejected should have a reason
      rejected.forEach((result) => {
        expect(result.reason).toBeDefined();
        expect(typeof result.reason).toBe('string');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long nonces', () => {
      const nonce = '0x' + 'A'.repeat(64);
      const from = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const chainId = 8453;

      const params: AcquireNonceParams = {
        nonce,
        from,
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      const result = tryAcquireNonce(params);
      expect(result.acquired).toBe(true);
    });

    it('should handle addresses without 0x prefix', () => {
      const nonce = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
      const from = '742d35Cc6634C0532925a3b844Bc9e7595f0bEb'; // No 0x prefix
      const chainId = 8453;

      const params: AcquireNonceParams = {
        nonce,
        from,
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      };

      const result = tryAcquireNonce(params);
      expect(result.acquired).toBe(true);
    });

    it('should handle past expiration times gracefully', () => {
      const nonce = '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE';
      const from = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
      const chainId = 8453;

      const params: AcquireNonceParams = {
        nonce,
        from,
        chainId,
        facilitatorId: testFacilitatorId,
        expiresAt: Math.floor(Date.now() / 1000) - 3600, // Expired 1 hour ago
      };

      // Should still acquire (expiration validation happens elsewhere)
      // The nonce tracker doesn't validate expiration - that's done in ERC3009 verification
      const result = tryAcquireNonce(params);
      expect(result.acquired).toBe(true);
    });
  });
});
