import { nanoid } from 'nanoid';
import { getDatabase } from './index.js';
import type { PaymentLinkRecord, PaymentLinkPaymentRecord } from './types.js';

/**
 * Create a new payment link
 */
export function createPaymentLink(data: {
  facilitator_id: string;
  name: string;
  description?: string;
  slug?: string;
  link_type?: 'payment' | 'redirect' | 'proxy';
  amount: string;
  asset: string;
  network: string;
  pay_to_address: string;
  success_redirect_url?: string;
  method?: string;
  headers_forward?: string[];
  webhook_id?: string;
  webhook_url?: string;
  webhook_secret?: string;
}): PaymentLinkRecord {
  const db = getDatabase();
  const id = nanoid();
  const slug = data.slug || id; // Default to ID if no slug provided

  const stmt = db.prepare(`
    INSERT INTO payment_links (id, facilitator_id, name, description, slug, link_type, amount, asset, network, pay_to_address, success_redirect_url, method, headers_forward, webhook_id, webhook_url, webhook_secret)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.facilitator_id,
    data.name,
    data.description || null,
    slug,
    data.link_type || 'payment',
    data.amount,
    data.asset,
    data.network,
    data.pay_to_address,
    data.success_redirect_url || null,
    data.method || 'GET',
    JSON.stringify(data.headers_forward || []),
    data.webhook_id || null,
    data.webhook_url || null,
    data.webhook_secret || null
  );

  return getPaymentLinkById(id)!;
}

/**
 * Get a payment link by ID
 */
export function getPaymentLinkById(id: string): PaymentLinkRecord | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM payment_links WHERE id = ?');
  return (stmt.get(id) as PaymentLinkRecord) || null;
}

/**
 * Get a payment link by ID or slug
 */
export function getPaymentLinkByIdOrSlug(facilitatorId: string, idOrSlug: string): PaymentLinkRecord | null {
  const db = getDatabase();
  // Try by ID first, then by slug
  const stmt = db.prepare('SELECT * FROM payment_links WHERE (id = ? OR (facilitator_id = ? AND slug = ?))');
  return (stmt.get(idOrSlug, facilitatorId, idOrSlug) as PaymentLinkRecord) || null;
}

/**
 * Get a payment link by slug
 */
export function getPaymentLinkBySlug(facilitatorId: string, slug: string): PaymentLinkRecord | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM payment_links WHERE facilitator_id = ? AND slug = ?');
  return (stmt.get(facilitatorId, slug) as PaymentLinkRecord) || null;
}

/**
 * Check if slug is unique for facilitator
 */
export function isSlugUnique(facilitatorId: string, slug: string, excludeId?: string): boolean {
  const db = getDatabase();
  if (excludeId) {
    const stmt = db.prepare('SELECT id FROM payment_links WHERE facilitator_id = ? AND slug = ? AND id != ?');
    return !stmt.get(facilitatorId, slug, excludeId);
  }
  const stmt = db.prepare('SELECT id FROM payment_links WHERE facilitator_id = ? AND slug = ?');
  return !stmt.get(facilitatorId, slug);
}

/**
 * Get all payment links for a facilitator
 */
export function getPaymentLinksByFacilitator(facilitatorId: string): PaymentLinkRecord[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM payment_links WHERE facilitator_id = ? ORDER BY created_at DESC');
  return stmt.all(facilitatorId) as PaymentLinkRecord[];
}

/**
 * Get active payment links for a facilitator
 */
export function getActivePaymentLinks(facilitatorId: string): PaymentLinkRecord[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM payment_links WHERE facilitator_id = ? AND active = 1 ORDER BY created_at DESC');
  return stmt.all(facilitatorId) as PaymentLinkRecord[];
}

/**
 * Update a payment link
 */
export function updatePaymentLink(
  id: string,
  updates: Partial<{
    name: string;
    description: string | null;
    slug: string;
    link_type: 'payment' | 'redirect' | 'proxy';
    amount: string;
    asset: string;
    network: string;
    pay_to_address: string;
    success_redirect_url: string | null;
    method: string;
    headers_forward: string[];
    webhook_id: string | null;
    webhook_url: string | null;
    webhook_secret: string | null;
    active: number;
  }>
): PaymentLinkRecord | null {
  const db = getDatabase();

  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description);
  }
  if (updates.slug !== undefined) {
    fields.push('slug = ?');
    values.push(updates.slug);
  }
  if (updates.link_type !== undefined) {
    fields.push('link_type = ?');
    values.push(updates.link_type);
  }
  if (updates.amount !== undefined) {
    fields.push('amount = ?');
    values.push(updates.amount);
  }
  if (updates.asset !== undefined) {
    fields.push('asset = ?');
    values.push(updates.asset);
  }
  if (updates.network !== undefined) {
    fields.push('network = ?');
    values.push(updates.network);
  }
  if (updates.pay_to_address !== undefined) {
    fields.push('pay_to_address = ?');
    values.push(updates.pay_to_address);
  }
  if (updates.success_redirect_url !== undefined) {
    fields.push('success_redirect_url = ?');
    values.push(updates.success_redirect_url);
  }
  if (updates.method !== undefined) {
    fields.push('method = ?');
    values.push(updates.method);
  }
  if (updates.headers_forward !== undefined) {
    fields.push('headers_forward = ?');
    values.push(JSON.stringify(updates.headers_forward));
  }
  if (updates.webhook_id !== undefined) {
    fields.push('webhook_id = ?');
    values.push(updates.webhook_id);
  }
  if (updates.webhook_url !== undefined) {
    fields.push('webhook_url = ?');
    values.push(updates.webhook_url);
  }
  if (updates.webhook_secret !== undefined) {
    fields.push('webhook_secret = ?');
    values.push(updates.webhook_secret);
  }
  if (updates.active !== undefined) {
    fields.push('active = ?');
    values.push(updates.active);
  }

  if (fields.length === 0) {
    return getPaymentLinkById(id);
  }

  fields.push("updated_at = datetime('now')");
  values.push(id);

  const stmt = db.prepare(`UPDATE payment_links SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);

  if (result.changes === 0) {
    return null;
  }

  return getPaymentLinkById(id);
}

/**
 * Delete a payment link
 */
export function deletePaymentLink(id: string): boolean {
  const db = getDatabase();
  const stmt = db.prepare('DELETE FROM payment_links WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

/**
 * Record a payment against a payment link
 */
export function createPaymentLinkPayment(data: {
  payment_link_id: string;
  payer_address: string;
  amount: string;
  transaction_hash?: string;
  status: 'pending' | 'success' | 'failed';
  error_message?: string;
}): PaymentLinkPaymentRecord {
  const db = getDatabase();
  const id = nanoid();

  const stmt = db.prepare(`
    INSERT INTO payment_link_payments (id, payment_link_id, payer_address, amount, transaction_hash, status, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    data.payment_link_id,
    data.payer_address,
    data.amount,
    data.transaction_hash || null,
    data.status,
    data.error_message || null
  );

  return getPaymentLinkPaymentById(id)!;
}

/**
 * Get a payment link payment by ID
 */
export function getPaymentLinkPaymentById(id: string): PaymentLinkPaymentRecord | null {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM payment_link_payments WHERE id = ?');
  return (stmt.get(id) as PaymentLinkPaymentRecord) || null;
}

/**
 * Get all payments for a payment link
 */
export function getPaymentLinkPayments(paymentLinkId: string, limit = 50, offset = 0): PaymentLinkPaymentRecord[] {
  const db = getDatabase();
  const stmt = db.prepare('SELECT * FROM payment_link_payments WHERE payment_link_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?');
  return stmt.all(paymentLinkId, limit, offset) as PaymentLinkPaymentRecord[];
}

/**
 * Update a payment link payment status
 */
export function updatePaymentLinkPaymentStatus(
  id: string,
  status: 'pending' | 'success' | 'failed',
  transactionHash?: string,
  errorMessage?: string
): PaymentLinkPaymentRecord | null {
  const db = getDatabase();

  const fields: string[] = ['status = ?'];
  const values: (string | null)[] = [status];

  if (transactionHash !== undefined) {
    fields.push('transaction_hash = ?');
    values.push(transactionHash);
  }
  if (errorMessage !== undefined) {
    fields.push('error_message = ?');
    values.push(errorMessage);
  }

  values.push(id);

  const stmt = db.prepare(`UPDATE payment_link_payments SET ${fields.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);

  if (result.changes === 0) {
    return null;
  }

  return getPaymentLinkPaymentById(id);
}

/**
 * Get payment link stats
 */
export function getPaymentLinkStats(paymentLinkId: string): {
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  totalAmountCollected: string;
} {
  const db = getDatabase();

  const statsStmt = db.prepare(`
    SELECT
      COUNT(*) as total_payments,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_payments,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_payments,
      COALESCE(SUM(CASE WHEN status = 'success' THEN CAST(amount AS INTEGER) ELSE 0 END), 0) as total_amount
    FROM payment_link_payments
    WHERE payment_link_id = ?
  `);

  const result = statsStmt.get(paymentLinkId) as {
    total_payments: number;
    successful_payments: number;
    failed_payments: number;
    total_amount: number;
  };

  return {
    totalPayments: result.total_payments || 0,
    successfulPayments: result.successful_payments || 0,
    failedPayments: result.failed_payments || 0,
    totalAmountCollected: String(result.total_amount || 0),
  };
}

/**
 * Get payment links stats for a facilitator (aggregate)
 */
export function getFacilitatorPaymentLinksStats(facilitatorId: string): {
  totalLinks: number;
  activeLinks: number;
  totalPayments: number;
  totalAmountCollected: string;
} {
  const db = getDatabase();

  const linksStmt = db.prepare(`
    SELECT
      COUNT(*) as total_links,
      SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END) as active_links
    FROM payment_links
    WHERE facilitator_id = ?
  `);

  const linksResult = linksStmt.get(facilitatorId) as {
    total_links: number;
    active_links: number;
  };

  const paymentsStmt = db.prepare(`
    SELECT
      COUNT(*) as total_payments,
      COALESCE(SUM(CASE WHEN plp.status = 'success' THEN CAST(plp.amount AS INTEGER) ELSE 0 END), 0) as total_amount
    FROM payment_link_payments plp
    JOIN payment_links pl ON plp.payment_link_id = pl.id
    WHERE pl.facilitator_id = ?
  `);

  const paymentsResult = paymentsStmt.get(facilitatorId) as {
    total_payments: number;
    total_amount: number;
  };

  return {
    totalLinks: linksResult.total_links || 0,
    activeLinks: linksResult.active_links || 0,
    totalPayments: paymentsResult.total_payments || 0,
    totalAmountCollected: String(paymentsResult.total_amount || 0),
  };
}
