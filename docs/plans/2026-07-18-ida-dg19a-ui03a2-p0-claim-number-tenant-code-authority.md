---
title: IDA-DG19-A1 — RLS-safe claim-number tenant-code authority
date: 2026-07-18
status: accepted
authority: canonical_design_only
runtime_authorized: false
promoted_slice: IDA-UI03a2-P0
accepted_payload_sha256: d76a4da5190145d9571e718c0ab2aa9522a12d65b17fe940ee80eb5ddd5cea9e
base_sha: 5a1829971ad94b950aad45291f4f920007cbf176
parent_gate_sha256: 553921412065bebe92d58aec8eae060b666d7ba2e375a26c8911bb9c7441d430
risk_tier: 3
---

# IDA-DG19-A1 — RLS-safe claim-number tenant-code authority

This protected-path addendum records the delegated orchestrator's exact accepted split
receipt. It pauses the parent `IDA-UI03a2` implementation and promotes only
`IDA-UI03a2-P0`. This docs-only materialization authorizes no product, schema, RLS,
migration, rollout or deployment work. Runtime requires canonical merge, canonical and
dedicated-worktree resolver proof selecting only P0, a fresh AI OS observation and a
separate exact orchestrator runtime-authority receipt.

The accepted canonical payload is the single-line JSON string between the fences below.
Hash the payload bytes only, excluding the Markdown fence and line terminators. It is
exactly 8,677 ASCII bytes and must produce the SHA-256 recorded in frontmatter.

```text
{"schemaVersion":"ida.protected-path-addendum.v1","documentId":"IDA-DG19-A1","disposition":"split_required","candidate":{"id":"IDA-UI03a2-P0","title":"RLS-safe claim-number tenant-code authority","outcome":"The existing claim-number generator can consume a tenant-bound authority that exposes only the canonical stored tenant code inside a NOBYPASSRLS member transaction.","baseSha":"5a1829971ad94b950aad45291f4f920007cbf176","parentGateSha256":"553921412065bebe92d58aec8eae060b666d7ba2e375a26c8911bb9c7441d430","authority":"design_only_until_orchestrator_accepts_this_exact_hash_and_docs_only_canonical_promotion_selects_only_IDA-UI03a2-P0","mechanism":{"databaseFunction":"private.current_claim_number_tenant_code()","properties":["zero arguments","RETURNS text","STABLE SECURITY DEFINER","SET search_path = pg_catalog, pg_temp","all relation and function references fully qualified","static query with no dynamic SQL","returns only public.tenants.code"],"predicates":["app.current_tenant_id is nonblank","app.current_access_tenant_id equals current tenant","app.current_actor_id is nonblank","public.user.id equals current actor","public.user.tenant_id equals current tenant","public.user.role equals member","public.tenants.id equals current tenant","public.tenants.code is nonnull"],"acl":["REVOKE ALL ON FUNCTION from PUBLIC, anon, and authenticated","GRANT USAGE ON SCHEMA private and EXECUTE ON FUNCTION only to interdomestik_runtime_rls when that canonical role exists","missing runtime role remains fail closed and is checked by deployment preflight","runtime role must be NOBYPASSRLS, NOSUPERUSER, and not owner of function, schema, public.user, or public.tenants","no SELECT grant or RLS policy is added to public.tenants"],"typescript":["new claim-number-tenant-code.ts calls the zero-argument function in the current transaction and mints an opaque tenant-bound authority or null","generateClaimNumber accepts that authority optionally and rejects an authority whose tenantId differs from params.tenantId","generateClaimNumber keeps its existing direct public.tenants lookup for every caller that supplies no authority","when authority is supplied, the direct lookup remains first and the authority is used only if RLS hides the tenant row","missing or mismatched authority fails before claim_counters mutation","the extraction keeps modified claim-number.ts at or below 150 lines"]},"productionConfigMigrationFiles":[{"action":"NEW","path":"packages/database/src/claim-number-tenant-code.ts"},{"action":"MOD","path":"packages/database/src/claim-number.ts"},{"action":"NEW","path":"packages/database/drizzle/0093_ida_claim_number_tenant_code_authority.sql"},{"action":"MOD","path":"packages/database/drizzle/meta/_journal.json"},{"action":"MOD","path":"packages/database/package.json"},{"action":"MOD_BY_UNCHANGED_GENERATOR","path":"scripts/repo-size-budget.json"}],"testSpecSupportFiles":[{"action":"MOD","path":"packages/database/test/claim-number.test.ts"},{"action":"NEW","path":"packages/database/test/claim-number-tenant-code-rls.test.ts"}],"migrationMetadata":"Function-only custom migration; no Drizzle snapshot, following journaled SQL-only migrations 0088-0091.","ceilings":{"productionConfigMigration":6,"testSpecSupport":2,"engineeringDays":1.5,"visibleOutcomes":1,"principalProofSurface":"packages/database/test/claim-number-tenant-code-rls.test.ts"},"redAndLivePostgreSQLCases":["RED current NOBYPASSRLS generateClaimNumber reports Tenant code not found and the enclosing transaction rolls back","exact home/access/member/actor context returns only canonical stored tenants.code","blank tenant, access, or actor context returns null and writes nothing","tenant/access mismatch returns null and writes nothing","missing, foreign, nonmember, or wrong-home actor returns null and writes nothing","null tenant code fails before counter mutation","PUBLIC, anon, and authenticated cannot execute","interdomestik_runtime_rls is NOBYPASSRLS, NOSUPERUSER, nonowner, and the only executable runtime role","runtime direct SELECT from public.tenants remains denied and no tenant-row policy exists","catalog contract proves zero arguments, STABLE, SECURITY DEFINER, locked search_path, fully qualified static body, and restricted ACL","tenant-bound authority cannot be reused for another tenant","existing callers without authority retain direct-read and stored-code semantics","authority path preserves prefix, monotonic counter, conditional claim update, and retry behavior","authority denial rolls back claim number, counter, claim, lifecycle, event, and audit together","concurrent same-claim retries return one number and increment the counter once","pnpm db:rls:test:required executes the live test serially"],"rollback":["before UI03a2 consumes it, revert helper and generator changes then revoke and drop private.current_claim_number_tenant_code()","after consumption, roll back UI03a2 first and then remove the resolver","remove journal, required-test wiring, and deterministic size metadata deltas","no data backfill, tenant-row policy, or tenant or claim mutation requires reversal","existing privileged claim numbering remains unchanged; NOBYPASSRLS claim creation fails closed after rollback"],"abuseControls":["no function arguments and no caller-supplied tenant or code","three exact transaction GUCs plus member home-tenant equality","opaque tenant-bound TypeScript authority","scalar code-only disclosure","no broad tenants grant or policy","no dbAdmin pre-read and no out-of-transaction authority","locked search_path, fully qualified objects, and no dynamic SQL","restricted runtime-role ACL and ownership posture","generic application failure with no database, tenant, actor, or code existence leak"],"rejectedAlternatives":["tenant-row SELECT RLS policy because row security cannot restrict columns and would expose legal, tax, address, contact, and branding data","tenant-ID-derived or session-supplied code because tenants.code is stored authority","dbAdmin or pretransaction read because it violates the database boundary and creates TOCTOU","duplicated code projection because it creates synchronization authority and new schema or RLS complexity","public or argument-taking SECURITY DEFINER RPC because it expands the attack surface","private.current_tenant_id() because it belongs to the Supabase authenticated storage plane and returns no code"]},"pausedParentSlice":{"id":"IDA-UI03a2","state":"dirty_implementation_preserved_uncommitted_and_frozen","currentProductionConfigMigrationCount":18,"currentTestSpecSupportCount":5,"deterministicRepoSizeMetadataWouldRaiseCurrentProductionCountTo":19,"resumeCondition":"P0 must merge and close green first; UI03a2 then requires separately accepted exact replanning at no more than 18 production/config/migration and 10 test/spec/support files, including deterministic size metadata, plus renumbering its conflicting draft migration from 0093.","noProductEditUntilThen":true},"cumulativeEnvelope":{"P0":{"productionConfigMigration":6,"testSpecSupport":2,"engineeringDays":1.5},"UI03a2HardMaximumAfterReplan":{"productionConfigMigration":18,"testSpecSupport":10,"engineeringDays":4},"sequentialHardMaximum":{"productionConfigMigration":24,"testSpecSupport":12,"engineeringDays":5.5},"conclusion":"The combined work cannot truthfully remain one <=18/<=10/<=4 slice and must remain two governed slices."},"exclusionsPreserved":["apps/web/src/proxy.ts and canonical routes","auth, session, OTP, and routing architecture","tenancy or broad RLS architecture","Paddle and provider resources","uploads, documents, storage, and compression","injury or health persistence","German localization","dashboards and broad redesign","IDA-UI03b, IDA-UI03a0c, and IDA-UI01b","deployment and production alias changes"],"evidence":{"latestAiOsObservation":"61464fd685c673e5bf45fa7e471711a057d4f153dbc53822cba3dd1286aa2103","aiOsState":"Interdomestik authority=current, activeSlice=none, runtime=not_authorized; Brain stale and integrity drift advisory only","activeExecution":"current exact IDA-UI03a2 thread 019f74b5-cf4b-7cf0-b49a-72f7e73ee5d4 worktree 82f9/interdomestik-crystal-home head 5a182997 dirty changedCount=23 advisory_only","repositoryResolver":"ready activeSlice.id=IDA-UI03a2 only class=implementation tier=3","brain":"NON_PASS stale source snapshot; no recovery query used; canonical plans and current source/tests control","architectureReview":"PASS for exact prerequisite split; NON_PASS for same-slice tenant-row policy","securityReview":"CONDITIONAL_PASS for exact scalar SECURITY DEFINER controls and live proof; NON_PASS for resuming current UI03a2","humanUseful":"unknown_not_confirmed"}}
```

## Promotion-time reconciliation

- Parent runtime was separately authorized after PR `#1378` merged and dual-resolver
  proof passed. The exact source-thread authority request in turn
  `019f7509-5703-7a13-a95a-046e17f7197b` hashes to
  `581e8a1ce15c1d0c16e5aae22ac5c069d07b86fbcf66f35697df6c1119347441`; the
  orchestrator disposition in that turn hashes to
  `2dc8a9c439598606253f309aa07b7ecd93a5d429f7160a302bef3ec2dcd41425`.
  The former `not started` proof row described the pre-authority state and is superseded
  by these receipts plus the frozen-parent row.
- The exact content-complete NOBYPASSRLS live-stop handback in source turn
  `019f752a-634b-7532-8251-2032f9255a9d` hashes to
  `fb35e0eeeeddfd8a7d526640c591ebeeeb682591ba114b8ae119a5cb794b6fef`.
  It records the failing `tenants.code` read, rollback point, green proof before the stop,
  23 preserved paths and absence of commit, push, PR or deployment.
- Frozen-parent preservation observation
  `4a8fe4fcb99f995e92e6b1bba259c06e66bcf8411b39445bd24ba400d769ba98`
  accompanies the content-complete handback and confirms the parent worktree, branch,
  dirty paths and local database were not mutated during freeze. It is advisory
  preservation provenance, not runtime authority.
- Payload observation `61464fd6…` is the design/split-time AI OS observation. Promotion
  observation `e3ef69b7…` is the later current Brain/index state after exact P0 execution
  registration. Both are advisory; canonical repo authority and resolver govern.
- The frozen parent is currently 18 production/config/migration paths and would become 19
  only after deterministic size metadata. Its later replan must remove or consolidate at
  least one planned parent path to remain at or below 18 including metadata. Failure to
  produce that exact map is a stop condition; this promotion makes no feasibility claim
  for parent resumption.
- The P0 rollback matrix uses only canonical existing claim-number/schema APIs plus a
  synthetic enclosing transaction in the new live RLS test. It does not import, inspect or
  execute frozen UI03a2 code. Claim/lifecycle/event/audit assertions prove that denial
  aborts all representative writes in the enclosing transaction; conditional claim update
  is existing `generateClaimNumber` behavior.
- Clean main already journals `0092_ida_free_start_drafts`; therefore `0093` is the next
  canonical slot. The cited 0088–0091 pattern refers only to custom journaled SQL style,
  while 0092 is the generated migration immediately preceding P0.
- The missing-role deployment preflight is a future release validation requirement only.
  This slice may implement and test fail-closed migration behavior, but it authorizes no
  deployment, rollout, environment or alias mutation.
- Member-only resolution is intentional because the sole future consumer is the member
  UI03a2 handoff. Agent, staff, admin, missing and foreign actors must return null; any
  nonmember claim-number authority needs a separate gate.
- Payload predicate tokens `public.user` denote the existing quoted PostgreSQL relation
  `public."user"`; migration SQL must use that fully qualified quoted identifier for every
  table, column and ownership reference. This clarification changes no accepted payload
  byte and does not authorize an alternative relation.

## Current review disposition

- Sonnet 4.6 attempt 1 inspected no committed diff and returned wrong-surface findings;
  attempt 2 could not access the Codex worktree; the exact packet attempt then timed out
  without output. None is a PASS.
- Gemini 3.1 Pro Preview was blocked by provider quota/rate limit and is not a PASS.
- Opus 4.8 completed the exact committed-diff review. Its eight findings were reconciled
  above without changing the accepted payload bytes. The 252.5-second post-remediation
  review confirmed all eight resolutions and found only the missing full parent-preservation
  observation value; that minor traceability wording is fixed above.

No UI/operator benchmark is asserted for this backend security prerequisite. The parent
UI03a2 worktree, branch, dirty files and local database remain frozen and out of scope.
