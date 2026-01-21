# Requirements: OpenFacilitator v1.1

**Defined:** 2026-01-20
**Core Value:** SDK supports x402 v2 format; merchants have refund documentation

## v1.1 Requirements

Requirements for SDK v2 compliance and refund documentation.

### SDK Types

- [x] **SDK-01**: PaymentPayloadV1 interface with literal `x402Version: 1` discriminant
- [x] **SDK-02**: PaymentPayloadV2 interface with literal `x402Version: 2` and nested `accepted` field
- [x] **SDK-03**: Union type `PaymentPayload = PaymentPayloadV1 | PaymentPayloadV2`
- [ ] **SDK-04**: Type guard `isPaymentPayloadV1()` for runtime discrimination
- [ ] **SDK-05**: Type guard `isPaymentPayloadV2()` for runtime discrimination
- [ ] **SDK-06**: Helper function `getSchemeNetwork()` extracts scheme/network regardless of version
- [ ] **SDK-07**: Export all new types from package index
- [ ] **SDK-08**: `assertNever` utility for exhaustive version checking
- [x] **SDK-09**: PaymentRequirementsV1 and PaymentRequirementsV2 types with union
- [ ] **SDK-10**: Update `verify()` method to handle both v1 and v2 formats using getSchemeNetwork
- [ ] **SDK-11**: Update `settle()` method to handle both v1 and v2 formats using getSchemeNetwork
- [ ] **SDK-12**: Update request body construction to pass correct format to facilitator endpoints

### Refund Documentation

- [ ] **DOCS-01**: MDX page at `/docs/sdk/refunds/` with refund guide content
- [ ] **DOCS-02**: Sidebar navigation entry for refunds page
- [ ] **DOCS-03**: Code examples for `reportFailure` usage
- [ ] **DOCS-04**: Code examples for `withRefundProtection` middleware

## Future Requirements

Deferred to later milestones.

### Dashboard Polish

- Dashboard features spotlight for discoverability
- Email notifications when threshold reached
- Sybil cluster detection dashboard for admins

## Out of Scope

Explicitly excluded from v1.1.

| Feature | Reason |
|---------|--------|
| Breaking API changes | Backward compatibility required |
| Screenshots in docs | Code-only for v1.1, images later |
| PaymentAuthorization type updates | Not needed for v2 compliance |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SDK-01 | Phase 12 | Complete |
| SDK-02 | Phase 12 | Complete |
| SDK-03 | Phase 12 | Complete |
| SDK-04 | Phase 13 | Pending |
| SDK-05 | Phase 13 | Pending |
| SDK-06 | Phase 13 | Pending |
| SDK-07 | Phase 14 | Pending |
| SDK-08 | Phase 13 | Pending |
| SDK-09 | Phase 12 | Complete |
| SDK-10 | Phase 14 | Pending |
| SDK-11 | Phase 14 | Pending |
| SDK-12 | Phase 14 | Pending |
| DOCS-01 | Phase 15 | Pending |
| DOCS-02 | Phase 15 | Pending |
| DOCS-03 | Phase 15 | Pending |
| DOCS-04 | Phase 15 | Pending |

**Coverage:**
- v1.1 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0

---
*Requirements defined: 2026-01-20*
*Last updated: 2026-01-20 after roadmap creation*
