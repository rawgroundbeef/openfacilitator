# Roadmap: OpenFacilitator

## Milestones

- [x] **v1.0 MVP** - Phases 1-11 (shipped 2026-01-20)
- [x] **v1.1 SDK & Docs** - Phases 12-16 (shipped 2026-01-21)
- [ ] **v1.2 Subscription Wallet Overhaul** - Phases 17-21

## Phases

<details>
<summary>v1.0 MVP (Phases 1-11) - SHIPPED 2026-01-20</summary>

See: milestones/v1.0-ROADMAP.md for archived v1.0 phase details.

</details>

<details>
<summary>v1.1 SDK & Docs (Phases 12-16) - SHIPPED 2026-01-21</summary>

See: milestones/v1.1-ROADMAP.md for archived v1.1 phase details.

</details>

## v1.2 Subscription Wallet Overhaul

**Goal:** Replace confusing legacy embedded wallet with a dedicated Subscriptions section supporting dual-chain (Base + Solana) recurring payments.

### Phase 17: UI Cleanup & Subscriptions Section

**Goal:** Users see a clean header without legacy wallet and can access a new Subscriptions section in the dashboard.

**Dependencies:** None (foundation phase)

**Requirements:** UICL-01, UICL-02, UICL-03, SUBD-01, SUBD-02, SUBD-03, SUBD-04, SUBD-05

**Plans:** 3 plans

Plans:
- [x] 17-01-PLAN.md — Replace WalletDropdown with UserMenu in header
- [x] 17-02-PLAN.md — Add payment history API endpoint
- [x] 17-03-PLAN.md — Create Subscriptions page with status, billing, and history

**Success Criteria:**

1. User sees header without any wallet connection button or embedded wallet UI
2. User can navigate to Subscriptions tab in dashboard sidebar
3. User sees their subscription status (active/inactive/pending) on the Subscriptions page
4. User sees next billing date, subscription tier, and pricing information
5. User can view payment history with date, amount, chain, and transaction hash

---

### Phase 18: Multi-Chain Wallet Infrastructure

**Goal:** Users have both Base and Solana wallets available for subscription payments with visible addresses for funding.

**Dependencies:** Phase 17 (Subscriptions section exists)

**Requirements:** WALL-01, WALL-02, WALL-03, WALL-04

**Plans:** 2 plans

Plans:
- [x] 18-01-PLAN.md — Backend multi-wallet infrastructure (DB + API endpoints)
- [x] 18-02-PLAN.md — Frontend wallet cards UI with balance, copy, refresh

**Success Criteria:**

1. User sees both a Base wallet and Solana wallet in the Subscriptions section
2. Each wallet displays current balance with chain identifier (Base/Solana)
3. User can copy wallet addresses directly for external funding
4. User sees balance update in real-time after funding a wallet

---

### Phase 19: Chain Preference Logic

**Goal:** Users can set their preferred payment chain with intelligent defaults and fallback behavior.

**Dependencies:** Phase 18 (Multi-chain wallets exist)

**Requirements:** PREF-01, PREF-02, PREF-03

**Plans:** 2 plans

Plans:
- [x] 19-01-PLAN.md — Backend preference storage, API endpoints, default calculation
- [x] 19-02-PLAN.md — Toggle UI with optimistic updates, WalletCards integration

**Success Criteria:**

1. User who initially paid via Base sees Base as default preferred chain
2. User can toggle between Base and Solana preference via prominent switch in Subscriptions section
3. When preferred chain has insufficient balance, system attempts alternate chain before failing

---

### Phase 20: Recurring Payment Engine

**Goal:** Subscriptions auto-renew daily with graceful handling of insufficient funds.

**Dependencies:** Phase 18 (Wallets), Phase 19 (Chain preference)

**Requirements:** RECR-01, RECR-02, RECR-03, RECR-04, RECR-05, RECR-06

**Plans:** 4 plans

Plans:
- [x] 20-01-PLAN.md — Payment database layer and billing service with fallback logic
- [x] 20-02-PLAN.md — Billing cron endpoint and grace period management
- [x] 20-03-PLAN.md — Frontend grace period UI, CSV export, enhanced payment history
- [x] 20-04-PLAN.md — Base chain x402 payment support (gap closure)

**Success Criteria:**

1. User with sufficient balance sees subscription auto-renewed daily without manual action
2. User with insufficient preferred chain balance sees payment attempted from alternate chain
3. User with insufficient funds on both chains enters 7-day grace period before service suspension
4. User sees payment status as "pending" when both wallets have insufficient funds
5. User can view all subscription payments in history with transaction details and chain used

---

### Phase 21: Notifications & Edge Cases

**Goal:** Users receive timely notifications about payment status and subscription health.

**Dependencies:** Phase 20 (Payment engine generates events)

**Requirements:** NOTF-01, NOTF-02, NOTF-03, NOTF-04

**Success Criteria:**

1. User sees confirmation notification when subscription payment succeeds
2. User sees low balance warning when balance drops below 2x subscription cost
3. User sees alert when payment fails due to insufficient funds
4. User receives reminder notification 3 days before subscription expires

---

## Progress

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 17 | UI Cleanup & Subscriptions Section | 8 | Complete |
| 18 | Multi-Chain Wallet Infrastructure | 4 | Complete |
| 19 | Chain Preference Logic | 3 | Complete |
| 20 | Recurring Payment Engine | 6 | Complete |
| 21 | Notifications & Edge Cases | 4 | Pending |

**Total:** 25 requirements across 5 phases

---
*Roadmap created: 2026-01-22*
*Last updated: 2026-01-22 — Phase 20 complete (4 plans)*
