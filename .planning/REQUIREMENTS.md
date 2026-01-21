# Requirements: OpenFacilitator v1.1

**Defined:** 2026-01-20
**Core Value:** SDK supports x402 v2 format; merchants have refund documentation

## v1.1 Requirements

Requirements for SDK v2 compliance and refund documentation.

### SDK Types

- [ ] **SDK-01**: PaymentPayloadV1 interface with literal `x402Version: 1` discriminant
- [ ] **SDK-02**: PaymentPayloadV2 interface with literal `x402Version: 2` and nested `accepted` field
- [ ] **SDK-03**: Union type `PaymentPayload = PaymentPayloadV1 | PaymentPayloadV2`
- [ ] **SDK-04**: Type guard `isPaymentPayloadV1()` for runtime discrimination
- [ ] **SDK-05**: Type guard `isPaymentPayloadV2()` for runtime discrimination
- [ ] **SDK-06**: Helper function `getSchemeNetwork()` extracts scheme/network regardless of version
- [ ] **SDK-07**: Export all new types from package index
- [ ] **SDK-08**: `assertNever` utility for exhaustive version checking
- [ ] **SDK-09**: PaymentRequirementsV1 and PaymentRequirementsV2 types with union
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
| SDK-01 | TBD | Pending |
| SDK-02 | TBD | Pending |
| SDK-03 | TBD | Pending |
| SDK-04 | TBD | Pending |
| SDK-05 | TBD | Pending |
| SDK-06 | TBD | Pending |
| SDK-07 | TBD | Pending |
| SDK-08 | TBD | Pending |
| SDK-09 | TBD | Pending |
| SDK-10 | TBD | Pending |
| SDK-11 | TBD | Pending |
| SDK-12 | TBD | Pending |
| DOCS-01 | TBD | Pending |
| DOCS-02 | TBD | Pending |
| DOCS-03 | TBD | Pending |
| DOCS-04 | TBD | Pending |

**Coverage:**
- v1.1 requirements: 16 total
- Mapped to phases: 0
- Unmapped: 16 (pending roadmap)

---
*Requirements defined: 2026-01-20*
*Last updated: 2026-01-20 after initial definition*
