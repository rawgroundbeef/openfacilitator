import { randomUUID } from 'crypto';
import { getDatabase } from './index.js';

export interface UserWallet {
  id: string;
  user_id: string;
  wallet_address: string;
  encrypted_private_key: string;
  network: string;
  created_at: string;
}

/**
 * Create a new user wallet
 */
export function createUserWallet(
  userId: string,
  walletAddress: string,
  encryptedPrivateKey: string,
  network: string = 'base'
): UserWallet {
  const db = getDatabase();
  const id = randomUUID();

  const stmt = db.prepare(`
    INSERT INTO user_wallets (id, user_id, wallet_address, encrypted_private_key, network)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(id, userId, walletAddress, encryptedPrivateKey, network);

  return getUserWalletById(id)!;
}

/**
 * Get a user wallet by ID
 */
export function getUserWalletById(id: string): UserWallet | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM user_wallets WHERE id = ?');
  const wallet = stmt.get(id) as UserWallet | undefined;
  return wallet || null;
}

/**
 * Get a user wallet by user ID
 */
export function getUserWalletByUserId(userId: string): UserWallet | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM user_wallets WHERE user_id = ?');
  const wallet = stmt.get(userId) as UserWallet | undefined;
  return wallet || null;
}

/**
 * Get a user wallet by wallet address
 */
export function getUserWalletByAddress(address: string): UserWallet | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM user_wallets WHERE wallet_address = ?');
  const wallet = stmt.get(address) as UserWallet | undefined;
  return wallet || null;
}

/**
 * Delete a user wallet
 */
export function deleteUserWallet(userId: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM user_wallets WHERE user_id = ?');
  const result = stmt.run(userId);
  return result.changes > 0;
}
