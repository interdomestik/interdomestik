---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-09
---

# D02 Cross-Agent Messaging E2E Evidence

> Status: Active supporting input. This document records the code and verification evidence for `D02` cross-agent messaging isolation work inside `P-1` Infrastructure Debt Closure.

## Scope

`D02` required one narrow outcome:

- prove deterministically that an authenticated agent cannot read or act on another agent's client messaging thread from the agent workspace claim-selection surface

## Code Evidence

- agent workspace claim scope now requires an active `agent_clients` assignment before a claim is eligible for list rendering or `claimId` injection in [apps/web/src/app/[locale]/(agent)/agent/workspace/claims/\_core.ts](<../../apps/web/src/app/[locale]/(agent)/agent/workspace/claims/_core.ts>)
- core query contracts now cover both the active-assignment path and the cross-agent denial path in [apps/web/src/app/[locale]/(agent)/agent/workspace/claims/\_core.test.ts](<../../apps/web/src/app/[locale]/(agent)/agent/workspace/claims/_core.test.ts>)
- gate E2E now synthesizes a same-tenant, same-branch peer-agent claim and proves `claimId` denial in [apps/web/e2e/gate/agent-workspace-claims-selection.spec.ts](../../apps/web/e2e/gate/agent-workspace-claims-selection.spec.ts)

## Red-Green Evidence

The initial red check on 2026-03-09 was:

- `pnpm --filter @interdomestik/web exec playwright test e2e/gate/agent-workspace-claims-selection.spec.ts --grep "claimId denies cross-agent messaging thread selection" --project=gate-ks-sq --project=gate-mk-mk --max-failures=1`

That red run proved the bug at the workspace surface: a same-tenant peer-agent claim could still be selected by `claimId`, rendering drawer content and the `Send Message` action.

The following green checks passed after the scope fix:

- `pnpm --filter @interdomestik/web test:unit --run 'src/app/[locale]/(agent)/agent/workspace/claims/_core.test.ts'`
- `pnpm --filter @interdomestik/web exec playwright test e2e/gate/agent-workspace-claims-selection.spec.ts --grep "claimId denies cross-agent messaging thread selection" --project=gate-ks-sq --project=gate-mk-mk --max-failures=1`
- `pnpm --filter @interdomestik/web exec playwright test e2e/gate/agent-workspace-claims-selection.spec.ts --grep "message persists after reload when opening claim by claimId" --project=gate-ks-sq --project=gate-mk-mk --workers=1 --max-failures=1`
- `pnpm --filter @interdomestik/web exec playwright test e2e/gate/agent-workspace-claims-selection.spec.ts --project=gate-ks-sq --project=gate-mk-mk --workers=1 --max-failures=1`

## Notes

- the Playwright webserver initially served a stale standalone artifact because the build stamp only tracks committed `gitSha`; deleting the stamp allowed the test harness to rebuild under the correct E2E database and auth env
- the local parallel 5-worker run of the gate file timed out in the existing message-persistence spec, but the canonical serial gate shape (`--workers=1`) passed cleanly for the persistence slice and the full file

## Conclusion

`D02` is complete for code and focused local verification evidence.

The remaining live `P-1` queue is now `D03` through `D08`.
