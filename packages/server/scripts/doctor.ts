/**
 * OpenFacilitator "doctor" script
 *
 * Self-hosting diagnostics (env + DB + RPC connectivity).
 *
 * Usage:
 *   pnpm -C packages/server run of:doctor
 *   pnpm -C packages/server run of:doctor -- --json
 *
 * From repo root:
 *   pnpm of:doctor
 *
 * Notes:
 * - Non-invasive: does NOT create a database file. If the DB doesn't exist yet,
 *   we warn and skip table/migration checks.
 * - Does not print secrets; only indicates whether values are set.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

type CheckStatus = 'pass' | 'warn' | 'fail';

interface Check {
  name: string;
  status: CheckStatus;
  message: string;
  fix?: string;
}

interface CategoryResult {
  category: string;
  checks: Check[];
}

interface DoctorReport {
  ok: boolean;
  summary: { passed: number; warnings: number; failures: number };
  meta: {
    timestamp: string;
    cwd: string;
    node: string;
  };
  categories: CategoryResult[];
}

function parseArgs(argv: string[]): { json: boolean; timeoutMs: number } {
  const json = argv.includes('--json');
  const timeoutFlag = argv.find((a) => a.startsWith('--timeout-ms='));
  const timeoutMs = timeoutFlag ? Number(timeoutFlag.split('=')[1]) : 5000;
  return { json, timeoutMs: Number.isFinite(timeoutMs) ? timeoutMs : 5000 };
}

function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return 'n/a';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function summarize(categories: CategoryResult[]): DoctorReport['summary'] {
  let passed = 0;
  let warnings = 0;
  let failures = 0;

  for (const cat of categories) {
    for (const check of cat.checks) {
      if (check.status === 'pass') passed++;
      else if (check.status === 'warn') warnings++;
      else failures++;
    }
  }

  return { passed, warnings, failures };
}

function redactValue(value: string | undefined): string {
  return value && value.trim().length > 0 ? '(set)' : '(not set)';
}

function envOrDefault(key: string, fallback: string): { value: string; isDefault: boolean } {
  const raw = process.env[key];
  if (raw && raw.trim().length > 0) return { value: raw, isDefault: false };
  return { value: fallback, isDefault: true };
}

async function checkJsonRpc(
  url: string,
  payload: unknown,
  timeoutMs: number
): Promise<{ status: CheckStatus; message: string }> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const elapsed = Date.now() - started;

    if (!res.ok) {
      return { status: 'fail', message: `HTTP ${res.status} (${formatMs(elapsed)})` };
    }

    // Try parse JSON (some providers return HTML on auth errors)
    const text = await res.text();
    try {
      JSON.parse(text);
    } catch {
      return { status: 'fail', message: `Non-JSON response (${formatMs(elapsed)})` };
    }

    if (elapsed >= 1000) return { status: 'warn', message: `OK but slow (${formatMs(elapsed)})` };
    return { status: 'pass', message: `OK (${formatMs(elapsed)})` };
  } catch (err) {
    const elapsed = Date.now() - started;
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'fail', message: `${msg} (${formatMs(elapsed)})` };
  }
}

function getRepoRelative(p: string): string {
  // Best-effort nice output; falls back to absolute
  const cwd = process.cwd();
  if (p.startsWith(cwd)) return path.relative(cwd, p) || '.';
  return p;
}

function checkEnvironment(): CategoryResult {
  const checks: Check[] = [];

  // Core auth/encryption
  const authSecret = process.env.BETTER_AUTH_SECRET;
  const encryptionSecret = process.env.ENCRYPTION_SECRET;
  if ((!authSecret || authSecret.trim().length === 0) && (!encryptionSecret || encryptionSecret.trim().length === 0)) {
    checks.push({
      name: 'BETTER_AUTH_SECRET / ENCRYPTION_SECRET',
      status: 'fail',
      message: 'Neither secret is set',
      fix: 'Set BETTER_AUTH_SECRET (recommended) or ENCRYPTION_SECRET in packages/server/.env',
    });
  } else {
    checks.push({
      name: 'BETTER_AUTH_SECRET / ENCRYPTION_SECRET',
      status: 'pass',
      message: authSecret && authSecret.trim().length > 0 ? 'BETTER_AUTH_SECRET is set' : 'ENCRYPTION_SECRET is set',
    });
  }

  // URLs / routing
  const betterAuthUrl = envOrDefault('BETTER_AUTH_URL', 'http://localhost:5002');
  checks.push({
    name: 'BETTER_AUTH_URL',
    status: betterAuthUrl.isDefault ? 'warn' : 'pass',
    message: betterAuthUrl.isDefault ? `Not set (default: ${betterAuthUrl.value})` : 'Set',
  });

  const dashboardUrl = process.env.DASHBOARD_URL;
  checks.push({
    name: 'DASHBOARD_URL',
    status: dashboardUrl && dashboardUrl.trim().length > 0 ? 'pass' : 'warn',
    message: dashboardUrl && dashboardUrl.trim().length > 0 ? 'Set' : 'Not set (may cause CORS issues)',
    fix: dashboardUrl && dashboardUrl.trim().length > 0 ? undefined : 'Set DASHBOARD_URL (e.g., http://localhost:3000)',
  });

  // DB path
  const dbPath = envOrDefault('DATABASE_PATH', './data/openfacilitator.db');
  checks.push({
    name: 'DATABASE_PATH',
    status: dbPath.isDefault ? 'warn' : 'pass',
    message: dbPath.isDefault ? `Not set (default: ${dbPath.value})` : `Set (${dbPath.value})`,
  });

  // Stats endpoints require treasury addresses (stats router is always mounted)
  const treasuryBase = process.env.TREASURY_BASE;
  const treasurySolana = process.env.TREASURY_SOLANA;
  checks.push({
    name: 'TREASURY_BASE',
    status: treasuryBase && treasuryBase.trim().length > 0 ? 'pass' : 'warn',
    message: treasuryBase && treasuryBase.trim().length > 0 ? 'Set' : 'Not set (required for /stats/base)',
    fix: treasuryBase && treasuryBase.trim().length > 0 ? undefined : 'Set TREASURY_BASE to your Base treasury address',
  });
  checks.push({
    name: 'TREASURY_SOLANA',
    status: treasurySolana && treasurySolana.trim().length > 0 ? 'pass' : 'warn',
    message: treasurySolana && treasurySolana.trim().length > 0 ? 'Set' : 'Not set (required for /stats/solana)',
    fix: treasurySolana && treasurySolana.trim().length > 0 ? undefined : 'Set TREASURY_SOLANA to your Solana treasury address',
  });

  // Misc: access token secret is optional (has a fallback), but warn for production
  const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
  const encryptionKey = process.env.ENCRYPTION_KEY;
  checks.push({
    name: 'ACCESS_TOKEN_SECRET',
    status: accessTokenSecret && accessTokenSecret.trim().length > 0 ? 'pass' : 'warn',
    message: accessTokenSecret && accessTokenSecret.trim().length > 0 ? 'Set' : 'Not set (server will derive a default)',
    fix: accessTokenSecret && accessTokenSecret.trim().length > 0 ? undefined : 'Set ACCESS_TOKEN_SECRET for stable access token signing',
  });
  checks.push({
    name: 'ENCRYPTION_KEY',
    status: encryptionKey && encryptionKey.trim().length > 0 ? 'pass' : 'warn',
    message: encryptionKey && encryptionKey.trim().length > 0 ? 'Set' : 'Not set (used to derive access token secret fallback)',
    fix: encryptionKey && encryptionKey.trim().length > 0 ? undefined : 'Set ENCRYPTION_KEY (recommended for production)',
  });

  // Optional integrations (no failures)
  checks.push({
    name: 'RAILWAY_* (optional)',
    status: 'pass',
    message: `RAILWAY_TOKEN=${redactValue(process.env.RAILWAY_TOKEN)}, RAILWAY_PROJECT_ID=${redactValue(process.env.RAILWAY_PROJECT_ID)}`,
  });

  checks.push({
    name: 'FREE_FACILITATOR_* (optional)',
    status: 'pass',
    message: `FREE_FACILITATOR_EVM_KEY=${redactValue(process.env.FREE_FACILITATOR_EVM_KEY)}, FREE_FACILITATOR_SOLANA_KEY=${redactValue(process.env.FREE_FACILITATOR_SOLANA_KEY)}`,
  });

  return { category: 'Environment', checks };
}

function checkDatabase(): CategoryResult {
  const checks: Check[] = [];

  const configured = process.env.DATABASE_PATH || './data/openfacilitator.db';
  const absolute = path.resolve(configured);
  const dir = path.dirname(absolute);

  // Directory checks
  if (!fs.existsSync(dir)) {
    // Non-invasive: the server will create this directory on first run.
    checks.push({
      name: 'Database directory',
      status: 'warn',
      message: `Not found (${getRepoRelative(dir)})`,
      fix: 'Start the server once (it will create the database directory automatically)',
    });
  } else {
    try {
      fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK);
      checks.push({
        name: 'Database directory permissions',
        status: 'pass',
        message: `Readable & writable (${getRepoRelative(dir)})`,
      });
    } catch {
      checks.push({
        name: 'Database directory permissions',
        status: 'fail',
        message: `Not readable/writable (${getRepoRelative(dir)})`,
        fix: `Ensure the directory is writable: ${dir}`,
      });
    }
  }

  const exists = fs.existsSync(absolute);
  checks.push({
    name: 'Database file',
    status: exists ? 'pass' : 'warn',
    message: exists ? `Exists (${getRepoRelative(absolute)})` : `Not found (${getRepoRelative(absolute)})`,
    fix: exists ? undefined : 'Run the server once to initialize the database and apply migrations',
  });

  if (!exists) {
    // Non-invasive: don't create DB file.
    return { category: 'Database', checks };
  }

  // Open DB read-only and check migrations
  let db: Database.Database | null = null;
  try {
    db = new Database(absolute, { readonly: true, fileMustExist: true });
    db.prepare('SELECT 1').get();
    checks.push({ name: 'Database connectivity', status: 'pass', message: 'OK' });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    checks.push({
      name: 'Database connectivity',
      status: 'fail',
      message: msg,
      fix: 'Verify DATABASE_PATH and ensure SQLite file is not locked/corrupted',
    });
    try {
      db?.close();
    } catch {
      // ignore
    }
    return { category: 'Database', checks };
  }

  try {
    const hasMigrationsTable = !!db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='migrations'")
      .get();

    if (!hasMigrationsTable) {
      checks.push({
        name: 'Migrations table',
        status: 'warn',
        message: 'Not found (migrations may not have run yet)',
        fix: 'Start the server once to create the migrations table and apply migrations',
      });
      return { category: 'Database', checks };
    }

    const executed = db.prepare('SELECT name, executed_at FROM migrations ORDER BY id ASC').all() as Array<{
      name: string;
      executed_at: string;
    }>;
    checks.push({
      name: 'Migrations applied',
      status: 'pass',
      message: `${executed.length} executed`,
    });

    // Compute expected migrations from filesystem (source-of-truth in repo)
    // Use script-relative path so it works even if cwd differs.
    const migrationsDir = fileURLToPath(new URL('../src/db/migrations', import.meta.url));
    const expected = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
      .map((f) => f.replace(/\.ts$/, ''))
      .sort();

    const executedSet = new Set(executed.map((m) => m.name));
    const pending = expected.filter((m) => !executedSet.has(m));

    if (pending.length > 0) {
      checks.push({
        name: 'Pending migrations',
        status: 'warn',
        message: `${pending.length} pending: ${pending.join(', ')}`,
        fix: 'Start the server to apply pending migrations',
      });
    } else {
      checks.push({
        name: 'Pending migrations',
        status: 'pass',
        message: 'None',
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    checks.push({
      name: 'Migration inspection',
      status: 'warn',
      message: msg,
      fix: 'If this persists, run the server once and re-run doctor',
    });
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
  }

  return { category: 'Database', checks };
}

async function checkNetwork(timeoutMs: number): Promise<CategoryResult> {
  const checks: Check[] = [];

  // Solana endpoints (even if unset, we can report default URLs)
  const solMain = envOrDefault('SOLANA_RPC_URL', 'https://api.mainnet-beta.solana.com');
  const solDev = envOrDefault('SOLANA_DEVNET_RPC_URL', 'https://api.devnet.solana.com');

  const solanaPayload = { jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] };
  const solMainRes = await checkJsonRpc(solMain.value, solanaPayload, timeoutMs);
  checks.push({
    name: `Solana Mainnet RPC (${solMain.isDefault ? 'default' : 'env'})`,
    status: solMainRes.status,
    message: `${solMain.value} → ${solMainRes.message}`,
  });

  const solDevRes = await checkJsonRpc(solDev.value, solanaPayload, timeoutMs);
  checks.push({
    name: `Solana Devnet RPC (${solDev.isDefault ? 'default' : 'env'})`,
    status: solDevRes.status,
    message: `${solDev.value} → ${solDevRes.message}`,
  });

  // EVM endpoints: check only explicitly configured *_RPC_URL values (avoid blasting many public RPCs)
  const rpcEnvKeys = Object.keys(process.env)
    .filter((k) => k.endsWith('_RPC_URL') && !k.startsWith('SOLANA_'))
    .sort();

  if (rpcEnvKeys.length === 0) {
    checks.push({
      name: 'EVM RPCs',
      status: 'warn',
      message: 'No *_RPC_URL env vars set (will rely on built-in defaults where applicable)',
    });
    return { category: 'Network Connectivity', checks };
  }

  const evmPayload = { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] };

  for (const key of rpcEnvKeys) {
    const value = process.env[key];
    if (!value || value.trim().length === 0) {
      checks.push({ name: key, status: 'warn', message: 'Set but empty' });
      continue;
    }

    const res = await checkJsonRpc(value, evmPayload, timeoutMs);
    checks.push({
      name: key,
      status: res.status,
      message: `${value} → ${res.message}`,
    });
  }

  return { category: 'Network Connectivity', checks };
}

function printHuman(report: DoctorReport): void {
  const { passed, warnings, failures } = report.summary;

  console.log('🩺 OpenFacilitator Doctor');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Node: ${report.meta.node}`);
  console.log(`CWD:  ${report.meta.cwd}`);
  console.log('');

  for (const category of report.categories) {
    console.log(`## ${category.category}`);
    for (const check of category.checks) {
      const prefix = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️ ' : '❌';
      console.log(`${prefix} ${check.name}: ${check.message}`);
      if (check.fix && check.status !== 'pass') {
        console.log(`   ↳ Fix: ${check.fix}`);
      }
    }
    console.log('');
  }

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Summary: ${passed} passed, ${warnings} warnings, ${failures} failures`);
  if (!report.ok) {
    console.log('Exit: non-zero (failures detected)');
  }
}

async function main(): Promise<void> {
  const { json, timeoutMs } = parseArgs(process.argv.slice(2));

  const categories: CategoryResult[] = [];
  categories.push(checkEnvironment());
  categories.push(checkDatabase());
  categories.push(await checkNetwork(timeoutMs));

  const summary = summarize(categories);
  const report: DoctorReport = {
    ok: summary.failures === 0,
    summary,
    meta: {
      timestamp: new Date().toISOString(),
      cwd: process.cwd(),
      node: process.version,
    },
    categories,
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Doctor failed: ${msg}`);
  process.exitCode = 1;
});

