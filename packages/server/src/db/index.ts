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
    
    // Add favicon column if it doesn't exist (stores base64-encoded image data)
    const hasFaviconColumn = columns.some(col => col.name === 'favicon');
    if (!hasFaviconColumn) {
      db.exec("ALTER TABLE facilitators ADD COLUMN favicon TEXT");
      console.log('✅ Added favicon column to facilitators table');
    }

    // Add webhook columns if they don't exist
    const hasWebhookUrl = columns.some(col => col.name === 'webhook_url');
    if (!hasWebhookUrl) {
      db.exec("ALTER TABLE facilitators ADD COLUMN webhook_url TEXT");
      console.log('✅ Added webhook_url column to facilitators table');
    }
    const hasWebhookSecret = columns.some(col => col.name === 'webhook_secret');
    if (!hasWebhookSecret) {
      db.exec("ALTER TABLE facilitators ADD COLUMN webhook_secret TEXT");
      console.log('✅ Added webhook_secret column to facilitators table');
    }
  } catch (e) {
    // Table might not exist yet, that's fine
  }

  // Migration: Add pay_to_address column to payment_links table
  try {
    const paymentLinksColumns = db.prepare("PRAGMA table_info(payment_links)").all() as { name: string }[];
    const hasPayToAddress = paymentLinksColumns.some(col => col.name === 'pay_to_address');
    if (paymentLinksColumns.length > 0 && !hasPayToAddress) {
      // For existing links without pay_to_address, we need to set a default
      // We'll set it to empty string and require it to be updated
      db.exec("ALTER TABLE payment_links ADD COLUMN pay_to_address TEXT NOT NULL DEFAULT ''");
      console.log('✅ Added pay_to_address column to payment_links table');
    }

    // Add webhook_id column if it doesn't exist
    const hasWebhookId = paymentLinksColumns.some(col => col.name === 'webhook_id');
    if (paymentLinksColumns.length > 0 && !hasWebhookId) {
      db.exec("ALTER TABLE payment_links ADD COLUMN webhook_id TEXT REFERENCES webhooks(id) ON DELETE SET NULL");
      console.log('✅ Added webhook_id column to payment_links table');
    }
  } catch (e) {
    // Table might not exist yet, that's fine
  }

  // Migration: Remove CHECK constraint from subscriptions table (only 'starter' tier now)
  try {
    const tableInfo = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='subscriptions'").get() as { sql: string } | undefined;
    if (tableInfo && tableInfo.sql && tableInfo.sql.includes('CHECK')) {
      console.log('🔄 Migrating subscriptions table (removing CHECK constraint)...');
      
      db.exec(`
        CREATE TABLE IF NOT EXISTS subscriptions_new (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
          tier TEXT NOT NULL DEFAULT 'starter',
          amount INTEGER NOT NULL,
          tx_hash TEXT,
          started_at TEXT NOT NULL DEFAULT (datetime('now')),
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        
        INSERT INTO subscriptions_new SELECT * FROM subscriptions;
        DROP TABLE subscriptions;
        ALTER TABLE subscriptions_new RENAME TO subscriptions;
        
        CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_tx_hash ON subscriptions(tx_hash);
      `);
      
      console.log('✅ Migrated subscriptions table');
    }
  } catch (e) {
    // Table might not exist yet
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
      favicon TEXT,
      webhook_url TEXT,
      webhook_secret TEXT,
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
      tier TEXT NOT NULL DEFAULT 'starter',
      amount INTEGER NOT NULL,
      tx_hash TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_expires ON subscriptions(expires_at);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_tx_hash ON subscriptions(tx_hash);

    -- Payment Links table (shareable payment URLs)
    CREATE TABLE IF NOT EXISTS payment_links (
      id TEXT PRIMARY KEY,
      facilitator_id TEXT NOT NULL REFERENCES facilitators(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      amount TEXT NOT NULL,
      asset TEXT NOT NULL,
      network TEXT NOT NULL,
      pay_to_address TEXT NOT NULL,
      success_redirect_url TEXT,
      webhook_id TEXT REFERENCES webhooks(id) ON DELETE SET NULL,
      webhook_url TEXT,
      webhook_secret TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Payment Link Payments table (track payments made via links)
    CREATE TABLE IF NOT EXISTS payment_link_payments (
      id TEXT PRIMARY KEY,
      payment_link_id TEXT NOT NULL REFERENCES payment_links(id) ON DELETE CASCADE,
      payer_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      transaction_hash TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_payment_links_facilitator ON payment_links(facilitator_id);
    CREATE INDEX IF NOT EXISTS idx_payment_links_active ON payment_links(active);
    CREATE INDEX IF NOT EXISTS idx_payment_link_payments_link ON payment_link_payments(payment_link_id);
    CREATE INDEX IF NOT EXISTS idx_payment_link_payments_status ON payment_link_payments(status);

    -- Webhooks table (first-class webhook entities)
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      facilitator_id TEXT NOT NULL REFERENCES facilitators(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '["payment_link.payment"]',
      action_type TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_webhooks_facilitator ON webhooks(facilitator_id);

    -- Pending facilitators table (awaiting payment)
    CREATE TABLE IF NOT EXISTS pending_facilitators (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES "user" ("id") ON DELETE CASCADE,
      name TEXT NOT NULL,
      custom_domain TEXT NOT NULL,
      subdomain TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_pending_facilitators_user ON pending_facilitators(user_id);
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
export * from './payment-links.js';
export * from './webhooks.js';
export * from './pending-facilitators.js';
export * from './types.js';

