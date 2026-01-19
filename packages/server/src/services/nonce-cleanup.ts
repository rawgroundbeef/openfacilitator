/**
 * Cleanup Service for Expired Nonces
 *
 * SECURITY: This service prevents unbounded growth of the used_nonces table
 * by periodically removing nonces that have expired.
 *
 * Run this as a cron job or background task to maintain database performance.
 */

import { cleanupExpiredNonces } from './nonce-tracker.js';

/**
 * Interval for running cleanup (default: 1 hour)
 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Start the nonce cleanup background job
 *
 * This will run cleanup at regular intervals to remove expired nonces
 * from the database.
 *
 * @returns Function to stop the cleanup job
 */
export function startNonceCleanupJob(): () => void {
  console.log('[NonceCleanup] Starting background cleanup job');
  console.log(`[NonceCleanup] Cleanup will run every ${CLEANUP_INTERVAL_MS / 1000 / 60} minutes`);

  // Run cleanup immediately on startup
  runCleanup();

  // Then run at regular intervals
  const intervalId = setInterval(runCleanup, CLEANUP_INTERVAL_MS);

  // Return function to stop the job
  return () => {
    console.log('[NonceCleanup] Stopping background cleanup job');
    clearInterval(intervalId);
  };
}

/**
 * Run a single cleanup cycle
 */
function runCleanup(): void {
  try {
    const deletedCount = cleanupExpiredNonces();
    console.log('[NonceCleanup] Cleanup completed:', {
      deletedNonces: deletedCount,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[NonceCleanup] Cleanup failed:', error);
  }
}

/**
 * Run cleanup on-demand (useful for manual triggers or testing)
 */
export function runManualCleanup(): number {
  console.log('[NonceCleanup] Running manual cleanup...');
  return cleanupExpiredNonces();
}
