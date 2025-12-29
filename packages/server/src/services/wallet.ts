/**
 * User billing wallet service
 * Manages custodial Solana wallets for user subscriptions
 */
import {
  generateSolanaKeypair,
  getSolanaPublicKey,
  getSolanaUSDCBalance,
} from '@openfacilitator/core';
import { encryptPrivateKey, decryptPrivateKey } from '../utils/crypto.js';
import { createUserWallet, getUserWalletByUserId } from '../db/user-wallets.js';

/**
 * Generate a new billing wallet for a user
 * Returns existing wallet if one already exists
 */
export async function generateWalletForUser(userId: string): Promise<{ address: string; created: boolean }> {
  // Check if wallet already exists
  const existing = getUserWalletByUserId(userId);
  if (existing) {
    return { address: existing.wallet_address, created: false };
  }

  // Generate new Solana keypair
  const keypair = generateSolanaKeypair();

  // Encrypt and store
  const encrypted = encryptPrivateKey(keypair.privateKey);
  createUserWallet(userId, keypair.publicKey, encrypted, 'solana');

  return { address: keypair.publicKey, created: true };
}

/**
 * Get wallet info for a user (address only, never private key)
 */
export function getWalletForUser(userId: string): { address: string; network: string } | null {
  const wallet = getUserWalletByUserId(userId);
  if (!wallet) return null;
  return { address: wallet.wallet_address, network: wallet.network };
}

/**
 * Decrypt user's private key for signing
 * INTERNAL USE ONLY - never expose via API
 */
export function decryptUserPrivateKey(userId: string): string {
  const wallet = getUserWalletByUserId(userId);
  if (!wallet) {
    throw new Error('Wallet not found for user');
  }
  return decryptPrivateKey(wallet.encrypted_private_key);
}

/**
 * Get USDC balance for a Solana wallet
 */
export async function getUSDCBalance(address: string): Promise<{ balance: bigint; formatted: string }> {
  return getSolanaUSDCBalance('solana', address);
}
