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

| Test File                       | Status     | Owner | Cause                                 | Fix Plan                                   | Expiry     |
| ------------------------------- | ---------- | ----- | ------------------------------------- | ------------------------------------------ | ---------- |
| `share-pack.spec.ts`            | ✅ DONE    | AI    | Test assertion drift                  | Fixed 404 vs 401 acceptance                | 2026-01-19 |
| `claim-tracking.ks.spec.ts`     | ✅ DONE    | AI    | Uses custom login instead of fixtures | Rewrote to use auth fixtures               | 2026-01-19 |
| `agent-pro-claims-rbac.spec.ts` | ⏳ PENDING | -     | Expects specific claim titles         | Match seed data or use flexible assertions | 2026-02-15 |
| `leads-flow.spec.ts`            | ⏳ PENDING | -     | UI elements changed (New Lead button) | Update selectors to current UI             | 2026-02-15 |

---

## Non-Quarantine Skips (Project-Level)

| Test File                       | Reason                 | Fix                       |
| ------------------------------- | ---------------------- | ------------------------- |
| `share-pack.spec.ts` MK project | No MK documents seeded | Add `doc-mk-1` to MK seed |

---

## Flaky Tests (Not Quarantined but Unstable)

| Test File                            | Symptom                        | Root Cause                     | Fix                     |
| ------------------------------------ | ------------------------------ | ------------------------------ | ----------------------- |
| `agent-home-lite.spec.ts`            | `agent-leads-lite` not visible | Testid missing from UI         | Add testid              |
| `agent-pro-claims.spec.ts`           | Timeout on isolated runs       | Race condition with drawer     | Add explicit wait       |
| `agent-pro-claims-messaging.spec.ts` | Intermittent failure           | Depends on claim data          | Use deterministic claim |
| `member-number.spec.ts:33`           | Registration timing            | Async member number assignment | Add retry logic         |

---

## Progress Timeline

| Date                       | Passed | Failed | Skipped | Notes                        |
| -------------------------- | ------ | ------ | ------- | ---------------------------- |
| 2026-01-19 Start           | 370    | 0      | 50      | Initial state                |
| 2026-01-19 +share-pack     | 375    | 0      | 51      | Unquarantined share-pack     |
| 2026-01-19 +claim-tracking | 380    | 1      | 51      | Unquarantined claim-tracking |

---

## Next Actions

1. **Fix agent-home-lite.spec.ts** - Add `agent-leads-lite` testid or update assertion
2. **Fix flaky tests** - Add retry logic and explicit waits
3. **Unquarantine agent-pro-claims-rbac** - Update seed assertions
4. **Unquarantine leads-flow** - Update UI selectors

---

## Definition of Done

- [ ] 0 tests with `@quarantine` tag
- [ ] 0 project-level skips (all tenants have required seed data)
- [ ] All tests pass 3x in a row without failures
- [ ] CI gate is green on push
