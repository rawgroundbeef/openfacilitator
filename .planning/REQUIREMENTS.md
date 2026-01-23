# Requirements: OpenFacilitator

**Defined:** 2026-01-22
**Core Value:** Users who process volume through OpenFacilitator get rewarded with $OPEN tokens. Facilitator owners get seamless subscription management with multi-chain support.

## v1.2 Requirements

Requirements for Subscription Wallet Overhaul milestone.

### UI Cleanup

- [x] **UICL-01**: Legacy embedded wallet removed from app header
- [x] **UICL-02**: Existing embedded wallet component archived (not deleted)
- [x] **UICL-03**: No orphaned wallet connection code in header

### Subscriptions Dashboard

- [x] **SUBD-01**: Subscriptions tab added to dashboard navigation
- [x] **SUBD-02**: Subscription status displayed (active/inactive/pending)
- [x] **SUBD-03**: Next billing date shown
- [x] **SUBD-04**: Subscription tier and pricing displayed
- [x] **SUBD-05**: Payment history with date, amount, chain, tx hash

### Multi-Chain Wallets

- [x] **WALL-01**: Base wallet implemented alongside Solana wallet
- [x] **WALL-02**: Each wallet displays balance and chain identifier
- [x] **WALL-03**: Wallet addresses visible for direct funding
- [x] **WALL-04**: Real-time balance updates on funding

### Chain Preference

- [x] **PREF-01**: Chain preference defaults based on initial payment chain
- [x] **PREF-02**: Prominent preference toggle in Subscriptions section
- [x] **PREF-03**: Fallback logic checks alternate chain if preferred is insufficient

### Recurring Payment Engine

- [x] **RECR-01**: Daily billing cron job queries due subscriptions
- [x] **RECR-02**: Auto-deduction from preferred chain wallet
- [x] **RECR-03**: Fallback to alternate chain if preferred insufficient
- [x] **RECR-04**: 7-day grace period before service suspension
- [x] **RECR-05**: Payment marked "pending" when both wallets insufficient
- [x] **RECR-06**: All subscription payments logged with tx details

### Notifications

- [ ] **NOTF-01**: Payment successful confirmation shown
- [ ] **NOTF-02**: Low balance warning when balance < 2x subscription cost
- [ ] **NOTF-03**: Payment failed / insufficient funds alert
- [ ] **NOTF-04**: Subscription expiring reminder (3 days before)

## Future Requirements

Deferred to later milestones.

### Rewards Enhancements

- **RWRD-01**: Dashboard features spotlight for discoverability
- **RWRD-02**: Email notifications when threshold reached
- **RWRD-03**: Sybil cluster detection dashboard for admins

### Subscription Enhancements

- **SUBE-01**: Prorated refunds for mid-cycle cancellation
- **SUBE-02**: Fund button with checkout flow (alternative to direct addresses)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Prorated refunds | Simplicity — subscription runs until end of paid period |
| Fund via checkout | Direct addresses preferred for power users, defer to future |
| Monthly funding cap | Pre-fund any amount allowed per user decision |
| Email notifications (subscriptions) | In-app notifications first, email later |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| UICL-01 | Phase 17 | Complete |
| UICL-02 | Phase 17 | Complete |
| UICL-03 | Phase 17 | Complete |
| SUBD-01 | Phase 17 | Complete |
| SUBD-02 | Phase 17 | Complete |
| SUBD-03 | Phase 17 | Complete |
| SUBD-04 | Phase 17 | Complete |
| SUBD-05 | Phase 17 | Complete |
| WALL-01 | Phase 18 | Complete |
| WALL-02 | Phase 18 | Complete |
| WALL-03 | Phase 18 | Complete |
| WALL-04 | Phase 18 | Complete |
| PREF-01 | Phase 19 | Complete |
| PREF-02 | Phase 19 | Complete |
| PREF-03 | Phase 19 | Complete |
| RECR-01 | Phase 20 | Complete |
| RECR-02 | Phase 20 | Complete |
| RECR-03 | Phase 20 | Complete |
| RECR-04 | Phase 20 | Complete |
| RECR-05 | Phase 20 | Complete |
| RECR-06 | Phase 20 | Complete |
| NOTF-01 | Phase 21 | Pending |
| NOTF-02 | Phase 21 | Pending |
| NOTF-03 | Phase 21 | Pending |
| NOTF-04 | Phase 21 | Pending |

**Coverage:**
- v1.2 requirements: 25 total
- Mapped to phases: 25
- Unmapped: 0

---
*Requirements defined: 2026-01-22*
*Last updated: 2026-01-22 after roadmap creation*
