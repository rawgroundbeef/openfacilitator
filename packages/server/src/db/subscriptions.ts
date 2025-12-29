import { randomUUID } from 'crypto';
import { getDatabase } from './index.js';

export interface Subscription {
  id: string;
  user_id: string;
  tier: 'basic' | 'pro';
  amount: number;
  tx_hash: string | null;
  started_at: string;
  expires_at: string;
  created_at: string;
}

// Pricing in USDC (6 decimals)
export const SUBSCRIPTION_PRICING = {
  basic: 5_000_000,  // $5 USDC
  pro: 25_000_000,   // $25 USDC
} as const;

/**
 * Create a new subscription record
 */
export function createSubscription(
  userId: string,
  tier: 'basic' | 'pro',
  expiresAt: Date,
  txHash?: string | null,
  amount?: number
): Subscription {
  const db = getDatabase();
  const id = randomUUID();
  const finalAmount = amount ?? SUBSCRIPTION_PRICING[tier];

  const stmt = db.prepare(`
    INSERT INTO subscriptions (id, user_id, tier, amount, tx_hash, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  stmt.run(id, userId, tier, finalAmount, txHash ?? null, expiresAt.toISOString());

  return getSubscriptionById(id)!;
}

/**
 * Get a subscription by ID
 */
export function getSubscriptionById(id: string): Subscription | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM subscriptions WHERE id = ?');
  const subscription = stmt.get(id) as Subscription | undefined;
  return subscription || null;
}

/**
 * Get the active subscription for a user (not expired)
 */
export function getActiveSubscription(userId: string): Subscription | null {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM subscriptions
    WHERE user_id = ? AND expires_at > datetime('now')
    ORDER BY expires_at DESC
    LIMIT 1
  `);
  const subscription = stmt.get(userId) as Subscription | undefined;
  return subscription || null;
}

/**
 * Get all subscriptions for a user (including expired)
 */
export function getSubscriptionsByUserId(userId: string): Subscription[] {
  const db = getDatabase();
  const stmt = db.prepare(`
    SELECT * FROM subscriptions
    WHERE user_id = ?
    ORDER BY created_at DESC
  `);
  return stmt.all(userId) as Subscription[];
}

/**
 * Check if a transaction hash has already been used
 */
export function getSubscriptionByTxHash(txHash: string): Subscription | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM subscriptions WHERE tx_hash = ?');
  const subscription = stmt.get(txHash) as Subscription | undefined;
  return subscription || null;
}

/**
 * Extend an existing subscription by adding days to its expiration
 */
export function extendSubscription(
  subscriptionId: string,
  additionalDays: number,
  tier: 'basic' | 'pro',
  newTxHash?: string | null
): Subscription | null {
  const db = getDatabase();

  // Get current subscription
  const current = getSubscriptionById(subscriptionId);
  if (!current) return null;

  // Calculate new expiration date
  const currentExpires = new Date(current.expires_at);
  const now = new Date();

  // If subscription is already expired, extend from now
  // Otherwise, extend from current expiration date
  const baseDate = currentExpires > now ? currentExpires : now;
  const newExpires = new Date(baseDate);
  newExpires.setDate(newExpires.getDate() + additionalDays);

  const amount = SUBSCRIPTION_PRICING[tier];

  // Update the subscription (upgrade tier if higher)
  const newTier = tier === 'pro' || current.tier === 'pro' ? 'pro' : 'basic';

  const stmt = db.prepare(`
    UPDATE subscriptions
    SET expires_at = ?, tier = ?, amount = amount + ?
    WHERE id = ?
  `);

  stmt.run(newExpires.toISOString(), newTier, amount, subscriptionId);

  return getSubscriptionById(subscriptionId);
}

/**
 * Check if a user exists in the Better Auth user table
 */
export function userExists(userId: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('SELECT id FROM "user" WHERE id = ?');
  const user = stmt.get(userId);
  return !!user;
}
