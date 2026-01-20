# E2E Quarantine Burn-Down Tracker

**Goal**: 0 quarantined tests, 0 skipped tests
**Started**: 2026-01-19
**Current**: 51 skipped (quarantine + project skips)

## Status Legend

- ✅ **DONE** - Unquarantined and running in gate
- 🔧 **IN PROGRESS** - Currently being fixed
- ⏳ **PENDING** - Waiting for fix

---

## Quarantine Registry

| Test File                       | Status  | Owner | Cause                                 | Fix Plan                                 | Expiry     |
| ------------------------------- | ------- | ----- | ------------------------------------- | ---------------------------------------- | ---------- |
| `share-pack.spec.ts`            | ✅ DONE | AI    | Test assertion drift                  | Fixed 404 vs 401 acceptance              | 2026-01-19 |
| `claim-tracking.ks.spec.ts`     | ✅ DONE | AI    | Uses custom login instead of fixtures | Rewrote to use auth fixtures             | 2026-01-19 |
| `agent-pro-claims-rbac.spec.ts` | ✅ DONE | AI    | Expects specific claim titles         | Enforced branch isolation, updated seed  | 2026-01-19 |
| `leads-flow.spec.ts`            | ✅ DONE | AI    | UI elements changed (New Lead button) | Updated selectors, table schema, asserts | 2026-01-19 |

---

## Non-Quarantine Skips (Project-Level)

| Test File                       | Reason                 | Fix                       |
| ------------------------------- | ---------------------- | ------------------------- |
| `share-pack.spec.ts` MK project | No MK documents seeded | Add `doc-mk-1` to MK seed |

---

## Flaky Tests (Not Quarantined but Unstable)

| Test File                            | Symptom                        | Root Cause                     | Fix                     |
| ------------------------------------ | ------------------------------ | ------------------------------ | ----------------------- |
| `agent-home-lite.spec.ts`            | `agent-leads-lite` not visible | Testid missing from UI         | ✅ Fixed                |
| `agent-pro-claims.spec.ts`           | Timeout on isolated runs       | Race condition with drawer     | Add explicit wait       |
| `agent-pro-claims-messaging.spec.ts` | Intermittent failure           | Depends on claim data          | Use deterministic claim |
| `member-number.spec.ts:33`           | Registration timing            | Async member number assignment | Add retry logic         |

---

## Progress Timeline

| Date                       | Passed | Failed | Skipped | Notes                               |
| -------------------------- | ------ | ------ | ------- | ----------------------------------- |
| 2026-01-19 Start           | 370    | 0      | 50      | Initial state                       |
| 2026-01-19 +share-pack     | 375    | 0      | 51      | Unquarantined share-pack            |
| 2026-01-19 +claim-tracking | 380    | 1      | 51      | Unquarantined claim-tracking        |
| 2026-01-19 +agent-claims   | 381    | 0      | 52      | Unquarantined agent-pro-claims-rbac |
| 2026-01-19 +leads-flow     | 381    | 0      | 52      | Unquarantined leads-flow            |

---

## Next Actions

1. **Fix flaky tests** - Add retry logic and explicit waits to remaining flakies
2. **Full Regression** - Run full suite overnight to verify stability

---

## Definition of Done

- [ ] 0 tests with `@quarantine` tag
- [ ] 0 project-level skips (all tenants have required seed data)
- [ ] All tests pass 3x in a row without failures
- [ ] CI gate is green on push
