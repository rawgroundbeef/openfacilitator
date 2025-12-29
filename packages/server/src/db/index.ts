import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

let db: Database.Database | null = null;

/**
 * Get the database instance
 */
export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return db;
}

/**
 * Initialize the SQLite database
 */
export function initializeDatabase(dbPath?: string): Database.Database {
  const databasePath = dbPath || process.env.DATABASE_PATH || './data/openfacilitator.db';

  // Ensure directory exists
  const dir = path.dirname(databasePath);
  if (dir !== '.') {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(databasePath);

  // Enable WAL mode for better concurrent performance
  db.pragma('journal_mode = WAL');

  // Run migrations for existing databases
  try {
    // Add encrypted_solana_private_key column if it doesn't exist
    const columns = db.prepare("PRAGMA table_info(facilitators)").all() as { name: string }[];
    const hasSolanaColumn = columns.some(col => col.name === 'encrypted_solana_private_key');
    if (!hasSolanaColumn) {
      db.exec('ALTER TABLE facilitators ADD COLUMN encrypted_solana_private_key TEXT');
      console.log('✅ Added encrypted_solana_private_key column to facilitators table');
    }
    
    // Add additional_domains column if it doesn't exist
    const hasAdditionalDomainsColumn = columns.some(col => col.name === 'additional_domains');
    if (!hasAdditionalDomainsColumn) {
      db.exec("ALTER TABLE facilitators ADD COLUMN additional_domains TEXT DEFAULT '[]'");
      console.log('✅ Added additional_domains column to facilitators table');
    }
  } catch (e) {
    // Table might not exist yet, that's fine
  }

  // Create tables
  db.exec(`
    -- Facilitators table
    CREATE TABLE IF NOT EXISTS facilitators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      subdomain TEXT UNIQUE NOT NULL,
      custom_domain TEXT UNIQUE,
      additional_domains TEXT NOT NULL DEFAULT '[]',
      owner_address TEXT NOT NULL,
      supported_chains TEXT NOT NULL DEFAULT '[]',
      supported_tokens TEXT NOT NULL DEFAULT '[]',
      encrypted_private_key TEXT,
      encrypted_solana_private_key TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Transactions table
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      facilitator_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('verify', 'settle')),
      network TEXT NOT NULL,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      asset TEXT NOT NULL,
      transaction_hash TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (facilitator_id) REFERENCES facilitators(id) ON DELETE CASCADE
    );

    -- Users table (for dashboard authentication)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      wallet_address TEXT UNIQUE NOT NULL,
      tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'pro')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Custom domain verification table
    CREATE TABLE IF NOT EXISTS domain_verifications (
      id TEXT PRIMARY KEY,
      facilitator_id TEXT NOT NULL,
      domain TEXT NOT NULL,
      verification_token TEXT NOT NULL,
      verified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (facilitator_id) REFERENCES facilitators(id) ON DELETE CASCADE
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_facilitators_subdomain ON facilitators(subdomain);
    CREATE INDEX IF NOT EXISTS idx_facilitators_custom_domain ON facilitators(custom_domain);
    CREATE INDEX IF NOT EXISTS idx_facilitators_owner ON facilitators(owner_address);
    CREATE INDEX IF NOT EXISTS idx_transactions_facilitator ON transactions(facilitator_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

    -- Better Auth tables
    CREATE TABLE IF NOT EXISTS "user" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "email" TEXT NOT NULL UNIQUE,
      "emailVerified" INTEGER NOT NULL DEFAULT 0,
      "image" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
      "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS "session" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "expiresAt" TEXT NOT NULL,
      "token" TEXT NOT NULL UNIQUE,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
      "updatedAt" TEXT NOT NULL DEFAULT (datetime('now')),
      "ipAddress" TEXT,
      "userAgent" TEXT,
      "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS "account" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "accountId" TEXT NOT NULL,
      "providerId" TEXT NOT NULL,
      "userId" TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
      "accessToken" TEXT,
      "refreshToken" TEXT,
      "idToken" TEXT,
      "accessTokenExpiresAt" TEXT,
      "refreshTokenExpiresAt" TEXT,
      "scope" TEXT,
      "password" TEXT,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
      "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS "verification" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "identifier" TEXT NOT NULL,
      "value" TEXT NOT NULL,
      "expiresAt" TEXT NOT NULL,
      "createdAt" TEXT NOT NULL DEFAULT (datetime('now')),
      "updatedAt" TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- User billing wallets (custodial wallets for subscriptions)
    CREATE TABLE IF NOT EXISTS user_wallets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE REFERENCES "user" ("id") ON DELETE CASCADE,
      wallet_address TEXT NOT NULL,
      encrypted_private_key TEXT NOT NULL,
      network TEXT NOT NULL DEFAULT 'base',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("userId");
    CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("userId");
    CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");
    CREATE INDEX IF NOT EXISTS idx_user_wallets_user ON user_wallets(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_wallets_address ON user_wallets(wallet_address);

    -- Subscriptions table (for Memeputer agent integration)
    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
      tier TEXT NOT NULL CHECK (tier IN ('basic', 'pro')),
      amount INTEGER NOT NULL,
      tx_hash TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_tx_hash ON subscriptions(tx_hash);
  `);

  console.log('✅ Database initialized at', databasePath);

  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
  }
}

export * from './facilitators.js';
export * from './transactions.js';
export * from './user-wallets.js';
export * from './subscriptions.js';
export * from './types.js';

