import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { runMigrations } from './migrations/index.js';

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

    // Add unified link columns (link_type, slug, method, headers_forward)
    const hasLinkType = paymentLinksColumns.some(col => col.name === 'link_type');
    if (paymentLinksColumns.length > 0 && !hasLinkType) {
      db.exec("ALTER TABLE payment_links ADD COLUMN link_type TEXT NOT NULL DEFAULT 'payment'");
      db.exec("ALTER TABLE payment_links ADD COLUMN slug TEXT");
      db.exec("ALTER TABLE payment_links ADD COLUMN method TEXT NOT NULL DEFAULT 'GET'");
      db.exec("ALTER TABLE payment_links ADD COLUMN headers_forward TEXT NOT NULL DEFAULT '[]'");
      // Generate slugs for existing links using their ID
      db.exec("UPDATE payment_links SET slug = id WHERE slug IS NULL");
      console.log('✅ Added unified link columns (link_type, slug, method, headers_forward)');
    }

    // Add access_ttl column (seconds of access after payment, 0 = pay per visit)
    const hasAccessTtl = paymentLinksColumns.some(col => col.name === 'access_ttl');
    if (paymentLinksColumns.length > 0 && !hasAccessTtl) {
      db.exec("ALTER TABLE payment_links ADD COLUMN access_ttl INTEGER NOT NULL DEFAULT 0");
      console.log('✅ Added access_ttl column to payment_links table');
    }

    // Add image_url column (for storefront display)
    const hasImageUrl = paymentLinksColumns.some(col => col.name === 'image_url');
    if (paymentLinksColumns.length > 0 && !hasImageUrl) {
      db.exec("ALTER TABLE payment_links ADD COLUMN image_url TEXT");
      console.log('✅ Added image_url column to payment_links table');
    }

    // Add required_fields column (JSON array of field definitions for variants, shipping, etc.)
    const hasRequiredFields = paymentLinksColumns.some(col => col.name === 'required_fields');
    if (paymentLinksColumns.length > 0 && !hasRequiredFields) {
      db.exec("ALTER TABLE payment_links ADD COLUMN required_fields TEXT NOT NULL DEFAULT '[]'");
      console.log('✅ Added required_fields column to payment_links table');
    }
  } catch (e) {
    // Table might not exist yet, that's fine
  }

  // Migration: Add required_fields to products table (if it exists and was already renamed)
  try {
    const productsColumns = db.prepare("PRAGMA table_info(products)").all() as { name: string }[];
    const hasRequiredFields = productsColumns.some(col => col.name === 'required_fields');
    if (productsColumns.length > 0 && !hasRequiredFields) {
      db.exec("ALTER TABLE products ADD COLUMN required_fields TEXT NOT NULL DEFAULT '[]'");
      console.log('✅ Added required_fields column to products table');
    }
  } catch (e) {
    // Table might not exist yet
  }

  // Migration: Add metadata column to product_payments table
  try {
    const paymentsColumns = db.prepare("PRAGMA table_info(product_payments)").all() as { name: string }[];
    const hasMetadata = paymentsColumns.some(col => col.name === 'metadata');
    if (paymentsColumns.length > 0 && !hasMetadata) {
      db.exec("ALTER TABLE product_payments ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'");
      console.log('✅ Added metadata column to product_payments table');
    }
  } catch (e) {
    // Table might not exist yet
  }

  // Migration: Add group_name column to products table (for variant grouping)
  try {
    const productsColumns = db.prepare("PRAGMA table_info(products)").all() as { name: string }[];
    const hasGroupName = productsColumns.some(col => col.name === 'group_name');
    if (productsColumns.length > 0 && !hasGroupName) {
      db.exec("ALTER TABLE products ADD COLUMN group_name TEXT");
      console.log('✅ Added group_name column to products table');
    }
  } catch (e) {
    // Table might not exist yet
  }

  // Migration: Rename payment_links → products and payment_link_payments → product_payments
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
    const hasPaymentLinks = tables.some(t => t.name === 'payment_links');
    const hasProducts = tables.some(t => t.name === 'products');

    if (hasPaymentLinks && !hasProducts) {
      console.log('🔄 Migrating payment_links → products...');
      db.exec('ALTER TABLE payment_links RENAME TO products');
      console.log('✅ Renamed payment_links to products');
    }

    const hasPaymentLinkPayments = tables.some(t => t.name === 'payment_link_payments');
    const hasProductPayments = tables.some(t => t.name === 'product_payments');

    if (hasPaymentLinkPayments && !hasProductPayments) {
      console.log('🔄 Migrating payment_link_payments → product_payments...');
      // Also rename the column payment_link_id → product_id
      db.exec(`
        CREATE TABLE product_payments (
          id TEXT PRIMARY KEY,
          product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
          payer_address TEXT NOT NULL,
          amount TEXT NOT NULL,
          transaction_hash TEXT,
          status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
          error_message TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO product_payments (id, product_id, payer_address, amount, transaction_hash, status, error_message, created_at)
          SELECT id, payment_link_id, payer_address, amount, transaction_hash, status, error_message, created_at
          FROM payment_link_payments;
        DROP TABLE payment_link_payments;
        CREATE INDEX IF NOT EXISTS idx_product_payments_product ON product_payments(product_id);
        CREATE INDEX IF NOT EXISTS idx_product_payments_status ON product_payments(status);
      `);
      console.log('✅ Migrated payment_link_payments to product_payments');
    }
  } catch (e) {
    // Tables might not exist yet
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

    -- Products table (x402 resources - payment, redirect, or proxy types)
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      facilitator_id TEXT NOT NULL REFERENCES facilitators(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      slug TEXT,
      link_type TEXT NOT NULL DEFAULT 'payment',
      amount TEXT NOT NULL,
      asset TEXT NOT NULL,
      network TEXT NOT NULL,
      pay_to_address TEXT NOT NULL,
      success_redirect_url TEXT,
      method TEXT NOT NULL DEFAULT 'GET',
      headers_forward TEXT NOT NULL DEFAULT '[]',
      access_ttl INTEGER NOT NULL DEFAULT 0,
      required_fields TEXT NOT NULL DEFAULT '[]',
      group_name TEXT,
      webhook_id TEXT REFERENCES webhooks(id) ON DELETE SET NULL,
      webhook_url TEXT,
      webhook_secret TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(facilitator_id, slug)
    );

    -- Product Payments table (track payments made for products)
    CREATE TABLE IF NOT EXISTS product_payments (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      payer_address TEXT NOT NULL,
      amount TEXT NOT NULL,
      transaction_hash TEXT,
      status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed')),
      error_message TEXT,
      metadata TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_products_facilitator ON products(facilitator_id);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(active);
    CREATE INDEX IF NOT EXISTS idx_products_slug ON products(facilitator_id, slug);
    CREATE INDEX IF NOT EXISTS idx_product_payments_product ON product_payments(product_id);
    CREATE INDEX IF NOT EXISTS idx_product_payments_status ON product_payments(status);

    -- Storefronts table (collections of products)
    CREATE TABLE IF NOT EXISTS storefronts (
      id TEXT PRIMARY KEY,
      facilitator_id TEXT NOT NULL REFERENCES facilitators(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      description TEXT,
      image_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(facilitator_id, slug)
    );

    -- Storefront-Products join table (many-to-many)
    CREATE TABLE IF NOT EXISTS storefront_products (
      storefront_id TEXT NOT NULL REFERENCES storefronts(id) ON DELETE CASCADE,
      product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (storefront_id, product_id)
    );

    CREATE INDEX IF NOT EXISTS idx_storefronts_facilitator ON storefronts(facilitator_id);
    CREATE INDEX IF NOT EXISTS idx_storefronts_slug ON storefronts(facilitator_id, slug);
    CREATE INDEX IF NOT EXISTS idx_storefront_products_storefront ON storefront_products(storefront_id);
    CREATE INDEX IF NOT EXISTS idx_storefront_products_product ON storefront_products(product_id);

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

    -- Proxy URLs table (API gateway/proxy with x402 payments)
    CREATE TABLE IF NOT EXISTS proxy_urls (
      id TEXT PRIMARY KEY,
      facilitator_id TEXT NOT NULL REFERENCES facilitators(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL,
      target_url TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT 'ANY',
      price_amount TEXT NOT NULL,
      price_asset TEXT NOT NULL,
      price_network TEXT NOT NULL,
      pay_to_address TEXT NOT NULL,
      headers_forward TEXT NOT NULL DEFAULT '[]',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(facilitator_id, slug)
    );

    CREATE INDEX IF NOT EXISTS idx_proxy_urls_facilitator ON proxy_urls(facilitator_id);
    CREATE INDEX IF NOT EXISTS idx_proxy_urls_slug ON proxy_urls(facilitator_id, slug);

    -- Used nonces table (persistent replay attack prevention)
    -- SECURITY: This table ensures nonce uniqueness across server restarts
    -- Each ERC-3009 authorization can only be settled once
    CREATE TABLE IF NOT EXISTS used_nonces (
      nonce TEXT NOT NULL,
      from_address TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      facilitator_id TEXT NOT NULL,
      transaction_hash TEXT,
      used_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      PRIMARY KEY (nonce, from_address, chain_id)
    );

    CREATE INDEX IF NOT EXISTS idx_nonces_expires ON used_nonces(expires_at);
    CREATE INDEX IF NOT EXISTS idx_nonces_facilitator ON used_nonces(facilitator_id);

    -- Refund configuration per facilitator (global enable/disable)
    CREATE TABLE IF NOT EXISTS refund_configs (
      id TEXT PRIMARY KEY,
      facilitator_id TEXT NOT NULL UNIQUE REFERENCES facilitators(id) ON DELETE CASCADE,
      enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Resource owners: third parties who use a facilitator and want refund protection
    CREATE TABLE IF NOT EXISTS resource_owners (
      id TEXT PRIMARY KEY,
      facilitator_id TEXT NOT NULL REFERENCES facilitators(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      refund_address TEXT,
      name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(facilitator_id, user_id)
    );

    -- Refund wallets (one per resource owner per network)
    CREATE TABLE IF NOT EXISTS refund_wallets (
      id TEXT PRIMARY KEY,
      resource_owner_id TEXT NOT NULL REFERENCES resource_owners(id) ON DELETE CASCADE,
      network TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      encrypted_private_key TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(resource_owner_id, network)
    );

    -- API keys for servers that can report failures (owned by resource owners)
    CREATE TABLE IF NOT EXISTS registered_servers (
      id TEXT PRIMARY KEY,
      resource_owner_id TEXT NOT NULL REFERENCES resource_owners(id) ON DELETE CASCADE,
      url TEXT NOT NULL DEFAULT '',
      name TEXT,
      api_key_hash TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Claims for refunds (scoped to resource owner via server)
    CREATE TABLE IF NOT EXISTS claims (
      id TEXT PRIMARY KEY,
      resource_owner_id TEXT NOT NULL REFERENCES resource_owners(id) ON DELETE CASCADE,
      server_id TEXT REFERENCES registered_servers(id) ON DELETE SET NULL,
      original_tx_hash TEXT NOT NULL UNIQUE,
      user_wallet TEXT NOT NULL,
      amount TEXT NOT NULL,
      asset TEXT NOT NULL,
      network TEXT NOT NULL,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'rejected', 'expired')),
      payout_tx_hash TEXT,
      reported_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT,
      expires_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_refund_configs_facilitator ON refund_configs(facilitator_id);
    CREATE INDEX IF NOT EXISTS idx_resource_owners_facilitator ON resource_owners(facilitator_id);
    CREATE INDEX IF NOT EXISTS idx_resource_owners_user ON resource_owners(user_id);
    CREATE INDEX IF NOT EXISTS idx_refund_wallets_resource_owner ON refund_wallets(resource_owner_id);
    CREATE INDEX IF NOT EXISTS idx_registered_servers_resource_owner ON registered_servers(resource_owner_id);
    CREATE INDEX IF NOT EXISTS idx_registered_servers_api_key ON registered_servers(api_key_hash);
    CREATE INDEX IF NOT EXISTS idx_claims_resource_owner ON claims(resource_owner_id);
    CREATE INDEX IF NOT EXISTS idx_claims_user_wallet ON claims(user_wallet);
    CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
  `);

  // Run migrations for schema updates
  runMigrations(db);

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
export * from './products.js';
export * from './webhooks.js';
export * from './pending-facilitators.js';
export * from './storefronts.js';
// Re-export proxy-urls selectively to avoid isSlugUnique conflict with products
export {
  createProxyUrl,
  getProxyUrlById,
  getProxyUrlBySlug,
  getProxyUrlsByFacilitator,
  updateProxyUrl,
  deleteProxyUrl,
  isSlugUnique as isProxySlugUnique,
} from './proxy-urls.js';
export * from './types.js';
export * from './refund-configs.js';
export * from './resource-owners.js';
export * from './refund-wallets.js';
export * from './registered-servers.js';
export * from './claims.js';

