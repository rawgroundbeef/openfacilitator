# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OpenFacilitator is an open-source multi-tenant platform for deploying x402 payment facilitators. It processes cryptocurrency payments across EVM chains (Ethereum, Base, Polygon, Avalanche, IoTeX, Peaq, Sei, XLayer), Solana, and Stacks using the x402 protocol (v1 and v2).

## Build & Development Commands

```bash
pnpm install          # Install all workspace dependencies
pnpm build            # Build all packages (Turbo, respects dependency graph)
pnpm dev              # Start all dev servers (dashboard :5001, server :3001)
pnpm lint             # TypeScript type checking across all packages
pnpm format           # Prettier formatting for all .ts/.tsx/.md files
pnpm clean            # Remove dist/ and node_modules across workspace
```

### Per-Package Commands

```bash
# Server tests
cd packages/server && pnpm test          # Run tests (vitest)
cd packages/server && pnpm test:watch    # Watch mode
cd packages/server && pnpm seed          # Seed test transaction data

# SDK tests
cd packages/sdk && pnpm test

# Integration tests (requires network access)
cd packages/integration-tests && pnpm test
```

Lint in any package is `tsc --noEmit`. Build is `tsc` for core/server, `tsup` (dual CJS/ESM) for sdk, and `next build` for dashboard.

## Architecture

**Monorepo** using pnpm workspaces + Turbo. Workspaces: `packages/*`, `apps/*`, `examples`.

### Package Dependency Graph

```
dashboard (Next.js 15) ──→ core
server (Express)       ──→ core, sdk
sdk                    ──→ (no internal deps)
core                   ──→ (no internal deps)
```

### Package Responsibilities

| Package | What it does |
|---------|-------------|
| `packages/core` | Payment verification, settlement logic, chain/token config. Uses viem (EVM), @solana/web3.js (Solana), and @stacks/transactions (Stacks). ERC-3009 signed transfers for EVM; pre-signed tx broadcast for Solana and Stacks. |
| `packages/server` | Multi-tenant Express API. Routes: facilitator (verify/settle/supported), admin CRUD, discovery, stats, rewards, subscriptions, webhooks. Auth via Better Auth with SQLite. |
| `packages/sdk` | Client library for integrators. Exports `OpenFacilitator` client, payment middleware (Express/Hono), error classes, network utilities, claims API. Zero runtime dependencies. |
| `apps/dashboard` | Next.js 15 + React 19 UI. Wallet integration via Wagmi (EVM), Solana Wallet Adapter, and Stacks Connect (Leather/Xverse). Radix UI components, TailwindCSS, Recharts. |

### Multi-Tenancy

Tenants are resolved from the request hostname (subdomain `{tenant}.openfacilitator.io` or custom domain). The middleware chain is: tenant resolution → authentication → route handling. Each tenant gets isolated facilitator configuration backed by SQLite.

### Key Server Paths

- `packages/server/src/index.ts` - Entry point (DB init, auth setup, server creation)
- `packages/server/src/server.ts` - Express app, middleware, route mounting
- `packages/server/src/routes/facilitator.ts` - Core x402 endpoints (verify, settle, supported)
- `packages/server/src/middleware/tenant.ts` - Tenant resolution from domain
- `packages/server/src/db/index.ts` - Database initialization and schema migrations

### Key Core Paths

- `packages/core/src/facilitator.ts` - Main verify/settle implementation
- `packages/core/src/chains.ts` - Chain definitions (EVM, Solana, Stacks)
- `packages/core/src/erc3009.ts` - ERC-3009 signed transfer verification (EVM)
- `packages/core/src/solana.ts` - Solana payment processing
- `packages/core/src/stacks.ts` - Stacks payment processing (STX, sBTC, USDCx)

## Code Standards

- **TypeScript strict mode** everywhere. No `any` — use `unknown` and narrow.
- Naming: files `kebab-case.ts`, types `PascalCase`, functions `camelCase`, constants `SCREAMING_SNAKE_CASE`.
- Prettier: semicolons, single quotes, 2-space indent, trailing commas (es5), 100 char width.
- Commit prefixes: `feat:`, `fix:`, `docs:`, `security:`, `refactor:`, `test:`, `chore:`.
- Mark security-critical code with `// SECURITY:` comments.
- Pre-commit hook runs `pnpm lint` via Husky.

## Security Context

This project handles real cryptocurrency payments. Key rules:
- Never log private keys, signatures, or credentials.
- Fail secure — reject transactions when uncertain.
- Use constant-time comparisons for signature verification.
- Validate all addresses, amounts, and signatures at boundaries.
- Private keys are non-custodial and optionally encrypted at rest.

## Environment Setup

Copy `packages/server/.env.example` to `packages/server/.env`. Required:
- `BETTER_AUTH_SECRET` — Random 32+ char string for session encryption
- `DATABASE_PATH` — SQLite path (default: `./data/openfacilitator.db`)

Optional: custom RPC URLs per chain (`BASE_RPC_URL`, `ETHEREUM_RPC_URL`, etc.).

## Docker

```bash
docker compose up -d    # Starts server (:3001) and dashboard (:3000)
```

Production Dockerfiles: `Dockerfile.server` (Node 20-alpine, SQLite at `/data`), `Dockerfile.dashboard` (Next.js standalone).
