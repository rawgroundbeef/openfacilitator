# Roadmap: OpenFacilitator

## Milestones

- [x] **v1.0 MVP** - Phases 1-11 (shipped 2026-01-20)
- [ ] **v1.1 SDK & Docs** - Phases 12-15 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-11) - SHIPPED 2026-01-20</summary>

See: milestones/v1.0-ROADMAP.md for archived v1.0 phase details.

</details>

### v1.1 SDK & Docs (In Progress)

**Milestone Goal:** SDK supports x402 v2 format with type-safe discrimination; merchants have refund documentation.

- [ ] **Phase 12: SDK Type Definitions** - Define versioned PaymentPayload and PaymentRequirements types
- [ ] **Phase 13: SDK Type Guards & Utilities** - Type guards and helper functions for version handling
- [ ] **Phase 14: SDK Method Updates** - Update verify/settle methods and exports
- [ ] **Phase 15: Refund Documentation** - Comprehensive refund guide for merchants

## Phase Details

### Phase 12: SDK Type Definitions
**Goal**: TypeScript consumers can discriminate between v1 and v2 payment payloads with full type narrowing
**Depends on**: Nothing (first phase of v1.1)
**Requirements**: SDK-01, SDK-02, SDK-03, SDK-09
**Success Criteria** (what must be TRUE):
  1. TypeScript recognizes `x402Version: 1` literal as PaymentPayloadV1
  2. TypeScript recognizes `x402Version: 2` literal as PaymentPayloadV2
  3. PaymentPayload union correctly narrows when version is checked
  4. PaymentRequirements types align with both payload versions
**Plans**: 1 plan

Plans:
- [ ] 12-01-PLAN.md — Define PaymentPayloadV1/V2 and PaymentRequirementsV1/V2 with discriminated unions

### Phase 13: SDK Type Guards & Utilities
**Goal**: Consumers have runtime utilities to safely handle versioned payloads
**Depends on**: Phase 12
**Requirements**: SDK-04, SDK-05, SDK-06, SDK-08
**Success Criteria** (what must be TRUE):
  1. `isPaymentPayloadV1()` narrows type to PaymentPayloadV1 in TypeScript
  2. `isPaymentPayloadV2()` narrows type to PaymentPayloadV2 in TypeScript
  3. `getSchemeNetwork()` extracts scheme/network from both v1 and v2 payloads
  4. `assertNever` catches unhandled version cases at compile time
**Plans**: TBD

Plans:
- [ ] 13-01: [TBD during planning]

### Phase 14: SDK Method Updates
**Goal**: SDK methods handle both v1 and v2 formats; all types exported
**Depends on**: Phase 13
**Requirements**: SDK-07, SDK-10, SDK-11, SDK-12
**Success Criteria** (what must be TRUE):
  1. All new types exported from `@openfacilitator/sdk` package index
  2. `verify()` accepts and correctly processes both v1 and v2 payloads
  3. `settle()` accepts and correctly processes both v1 and v2 payloads
  4. SDK builds successfully with `pnpm --filter=@openfacilitator/sdk build`
**Plans**: TBD

Plans:
- [ ] 14-01: [TBD during planning]

### Phase 15: Refund Documentation
**Goal**: Merchants have a comprehensive guide to implement refund protection
**Depends on**: Nothing (independent of SDK phases)
**Requirements**: DOCS-01, DOCS-02, DOCS-03, DOCS-04
**Success Criteria** (what must be TRUE):
  1. Refund guide accessible at `/docs/sdk/refunds/`
  2. Sidebar navigation includes refunds entry under SDK section
  3. `reportFailure` code examples demonstrate complete usage
  4. `withRefundProtection` middleware example shows end-to-end setup
**Plans**: TBD

Plans:
- [ ] 15-01: [TBD during planning]

## Progress

**Execution Order:** 12 -> 13 -> 14 -> 15 (13 depends on 12, 14 depends on 13, 15 is independent)

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 12. SDK Type Definitions | v1.1 | 0/1 | Planned | - |
| 13. SDK Type Guards & Utilities | v1.1 | 0/TBD | Not started | - |
| 14. SDK Method Updates | v1.1 | 0/TBD | Not started | - |
| 15. Refund Documentation | v1.1 | 0/TBD | Not started | - |
