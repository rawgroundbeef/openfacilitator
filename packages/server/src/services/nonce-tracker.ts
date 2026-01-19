/**
 * Persistent Nonce Tracker Service
 *
 * SECURITY: This service prevents replay attacks by ensuring each ERC-3009 authorization
 * nonce can only be used once, even across server restarts.
 *
 * Two-tier approach:
 * - L1 Cache: In-memory Map for fast lookups (prevents concurrent duplicates)
 * - L2 Storage: SQLite database for persistence (prevents post-restart duplicates)
 *
 * Critical for financial safety - DO NOT modify without security review.
 */

import { getDatabase } from '../db/index.js';
import type Database from 'better-sqlite3';

/**
 * In-memory nonce cache (L1)
 * Key: `${chainId}:${from}:${nonce}` - Value: timestamp when acquired
 *
 * This provides fast deduplication for concurrent requests before hitting the database.
 */
const processingNonces = new Map<string, number>();

/**
 * Time-to-live for in-memory cache entries (10 minutes)
 * Entries older than this are cleaned up to prevent memory leaks
 */
const NONCE_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Clean up old entries from in-memory cache every 5 minutes
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamp] of processingNonces.entries()) {
    if (now - timestamp > NONCE_CACHE_TTL_MS) {
      processingNonces.delete(key);
    }
  }
}, 5 * 60 * 1000);

/**
 * Generate cache key for a nonce
 */
function getCacheKey(chainId: number, from: string, nonce: string): string {
  return `${chainId}:${from.toLowerCase()}:${nonce.toLowerCase()}`;
}

/**
 * Parameters for acquiring a nonce
 */
export interface AcquireNonceParams {
  /** The nonce from the ERC-3009 authorization */
  nonce: string;
  /** The payer address (authorization.from) */
  from: string;
  /** The chain ID (e.g., 8453 for Base) */
  chainId: number;
  /** The facilitator ID processing this authorization */
  facilitatorId: string;
  /** Unix timestamp when this authorization expires (authorization.validBefore) */
  expiresAt: number;
}

/**
 * Result of trying to acquire a nonce
 */
export interface AcquireNonceResult {
  /** Whether the nonce was successfully acquired */
  acquired: boolean;
  /** Human-readable reason if acquisition failed */
  reason?: string;
}

/**
 * Try to acquire a nonce for settlement
 *
 * SECURITY: This function ensures atomicity through:
 * 1. In-memory check (fast path for concurrent requests)
 * 2. Database UNIQUE constraint (enforces uniqueness persistently)
 *
 * @param params Nonce acquisition parameters
 * @returns Result indicating success or failure with reason
 */
export function tryAcquireNonce(params: AcquireNonceParams): AcquireNonceResult {
  const { nonce, from, chainId, facilitatorId, expiresAt } = params;

  // Normalize inputs to prevent case-sensitivity issues
  const normalizedFrom = from.toLowerCase();
  const normalizedNonce = nonce.toLowerCase();
  const cacheKey = getCacheKey(chainId, normalizedFrom, normalizedNonce);

  // L1 Cache: Check in-memory cache first (fast path)
  if (processingNonces.has(cacheKey)) {
    console.log('[NonceTracker] DUPLICATE BLOCKED (L1 Cache):', { chainId, from: normalizedFrom, nonce: normalizedNonce });
    return {
      acquired: false,
      reason: 'This authorization is already being processed (concurrent request detected)',
    };
  }

  // L2 Storage: Check database for persistent nonce record
  const db = getDatabase();

  try {
    // Check if nonce already exists in database
    const existing = db
      .prepare(
        `SELECT nonce, transaction_hash, used_at FROM used_nonces
         WHERE nonce = ? AND from_address = ? AND chain_id = ?`
      )
      .get(normalizedNonce, normalizedFrom, chainId) as
      | { nonce: string; transaction_hash: string | null; used_at: string }
      | undefined;

    if (existing) {
      console.log('[NonceTracker] DUPLICATE BLOCKED (L2 Database):', {
        chainId,
        from: normalizedFrom,
        nonce: normalizedNonce,
        previousTx: existing.transaction_hash,
        usedAt: existing.used_at,
      });

      return {
        acquired: false,
        reason: existing.transaction_hash
          ? `This authorization was already settled in transaction ${existing.transaction_hash}`
          : 'This authorization nonce has already been used',
      };
    }

    // Atomically insert nonce into database
    // SECURITY: PRIMARY KEY constraint ensures no race condition between concurrent settlements
    const expiresAtTimestamp = new Date(expiresAt * 1000).toISOString();

    const stmt = db.prepare(`
      INSERT INTO used_nonces (nonce, from_address, chain_id, facilitator_id, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(normalizedNonce, normalizedFrom, chainId, facilitatorId, expiresAtTimestamp);

    // Add to in-memory cache after successful database insert
    processingNonces.set(cacheKey, Date.now());

    console.log('[NonceTracker] Nonce acquired successfully:', {
      chainId,
      from: normalizedFrom,
      nonce: normalizedNonce,
      facilitatorId,
    });

    return {
      acquired: true,
    };
  } catch (error) {
    // If database insert fails due to UNIQUE constraint, it means another process
    // acquired this nonce between our SELECT and INSERT (extremely rare with SQLite)
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      console.warn('[NonceTracker] Race condition detected - nonce acquired by concurrent process:', {
        chainId,
        from: normalizedFrom,
        nonce: normalizedNonce,
      });

      return {
        acquired: false,
        reason: 'This authorization was acquired by a concurrent settlement request',
      };
    }

    // Unexpected error - log and reject for safety
    console.error('[NonceTracker] Unexpected error acquiring nonce:', error);
    return {
      acquired: false,
      reason: 'Failed to validate nonce uniqueness - rejecting for safety',
    };
  }
}

/**
 * Release a nonce from the in-memory cache
 *
 * Call this if a transaction fails BEFORE on-chain submission.
 * DO NOT call this after successful submission - the nonce remains in the database.
 *
 * @param nonce The nonce to release
 * @param from The payer address
 * @param chainId The chain ID
 */
export function releaseNonce(nonce: string, from: string, chainId: number): void {
  const normalizedFrom = from.toLowerCase();
  const normalizedNonce = nonce.toLowerCase();
  const cacheKey = getCacheKey(chainId, normalizedFrom, normalizedNonce);

  processingNonces.delete(cacheKey);

  console.log('[NonceTracker] Nonce released from cache (pre-settlement failure):', {
    chainId,
    from: normalizedFrom,
    nonce: normalizedNonce,
  });
}

/**
 * Mark a nonce as successfully settled with transaction hash
 *
 * Call this after on-chain transaction confirmation.
 *
 * @param nonce The nonce that was settled
 * @param from The payer address
 * @param chainId The chain ID
 * @param transactionHash The on-chain transaction hash
 */
export function markNonceSettled(
  nonce: string,
  from: string,
  chainId: number,
  transactionHash: string
): void {
  const normalizedFrom = from.toLowerCase();
  const normalizedNonce = nonce.toLowerCase();

  const db = getDatabase();

  try {
    const stmt = db.prepare(`
      UPDATE used_nonces
      SET transaction_hash = ?
      WHERE nonce = ? AND from_address = ? AND chain_id = ?
    `);

    stmt.run(transactionHash, normalizedNonce, normalizedFrom, chainId);

    console.log('[NonceTracker] Nonce marked as settled:', {
      chainId,
      from: normalizedFrom,
      nonce: normalizedNonce,
      transactionHash,
    });
  } catch (error) {
    console.error('[NonceTracker] Failed to mark nonce as settled:', error);
    // Non-critical error - nonce is still tracked, just missing tx hash
  }
}

/**
 * Clean up expired nonces from the database
 *
 * SECURITY: This should run periodically (e.g., via cron) to prevent unbounded growth.
 * Only deletes nonces where expires_at < current time.
 *
 * @returns Number of nonces deleted
 */
export function cleanupExpiredNonces(): number {
  const db = getDatabase();

  try {
    const stmt = db.prepare(`
      DELETE FROM used_nonces
      WHERE expires_at < datetime('now')
    `);

    const result = stmt.run();
    const deletedCount = result.changes;

    console.log('[NonceTracker] Cleanup complete:', {
      deletedNonces: deletedCount,
      timestamp: new Date().toISOString(),
    });

    return deletedCount;
  } catch (error) {
    console.error('[NonceTracker] Cleanup failed:', error);
    return 0;
  }
}

/**
 * Get nonce usage statistics for a facilitator
 *
 * Useful for monitoring and debugging.
 *
 * @param facilitatorId The facilitator ID
 * @returns Statistics about nonce usage
 */
export function getNonceStats(facilitatorId: string): {
  totalNonces: number;
  settledNonces: number;
  pendingNonces: number;
  expiredNonces: number;
} {
  const db = getDatabase();

  const total = db
    .prepare('SELECT COUNT(*) as count FROM used_nonces WHERE facilitator_id = ?')
    .get(facilitatorId) as { count: number };

  const settled = db
    .prepare(
      'SELECT COUNT(*) as count FROM used_nonces WHERE facilitator_id = ? AND transaction_hash IS NOT NULL'
    )
    .get(facilitatorId) as { count: number };

  const pending = db
    .prepare(
      'SELECT COUNT(*) as count FROM used_nonces WHERE facilitator_id = ? AND transaction_hash IS NULL'
    )
    .get(facilitatorId) as { count: number };

  const expired = db
    .prepare(
      "SELECT COUNT(*) as count FROM used_nonces WHERE facilitator_id = ? AND expires_at < datetime('now')"
    )
    .get(facilitatorId) as { count: number };

  return {
    totalNonces: total.count,
    settledNonces: settled.count,
    pendingNonces: pending.count,
    expiredNonces: expired.count,
  };
}
