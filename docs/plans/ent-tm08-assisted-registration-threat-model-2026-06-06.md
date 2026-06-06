---
plan_role: input
status: active
source_of_truth: false
owner: agent-acquisition
last_reviewed: 2026-06-06
superseded_by:
---

# ENT-TM08 Assisted Registration Threat Model - 2026-06-06

> Status: Input document. This record applies the `ENT-TM01` contract to the
> agent-assisted member registration API and registration write core only. It does not
> change runtime behavior or claim full enterprise threat-model completion.

## Identity

- Surface: authenticated agent-assisted member registration.
- Owner: agent acquisition and tenant onboarding.
- Reviewers: PR reviewers, Copilot, SonarCloud, and CI/security gates.
- Entry points: `apps/web/src/app/api/register/route.ts`,
  `apps/web/src/app/api/register/_core.ts`,
  `apps/web/src/lib/actions/agent/register-member.ts`,
  `apps/web/src/lib/actions/agent/register-member.core.ts`,
  `apps/web/src/lib/actions/agent/schemas.core.ts`,
  `packages/domain-membership-billing/src/ownership-attribution.ts`.
- Proof files: `apps/web/src/app/api/register/route.test.ts`,
  `apps/web/src/app/api/register/_core.test.ts`,
  `apps/web/src/lib/actions/agent/register-member.wrapper.test.ts`,
  `apps/web/e2e/gate/register-tenant-attribution.spec.ts`.
- Source inventory: `docs/reviews/2026-04-25-sensitive-route-ownership-map.md`.
- Last reviewed: 2026-06-06.

## Data And Assets

- Protected data: member full name, email, phone, password before hashing, selected plan,
  tenant id, branch id, agent id/name, generated member number, account credential hash,
  ownership attribution, active client binding, and subscription state.
- Durable records: `user`, `account`, member-number sequence state, `agent_clients`,
  `subscriptions`, canonical membership plan state reads, and agent-assisted attribution fields.
- Storage objects or external systems: welcome email delivery through the email circuit breaker.
- Audit or provenance records: persisted `createdBy`, `agentId`, `assistedByAgentId`, branch,
  subscription agent id, and active agent-client binding.
- Explicit non-data: this record does not include raw passwords, production credentials, live
  member samples, email provider payloads, or tenant/customer exports.

## Actors And Trust Boundaries

- Trusted actors: authenticated agent sessions whose role is exactly `agent`, better-auth session
  state, server-side tenant resolution helpers, server-side registration core, and transactional
  database writes.
- Untrusted actors: unauthenticated callers, non-agent sessions, caller-controlled JSON bodies,
  caller-controlled `role`, plan, email, phone, password, host/header/cookie/query tenant hints,
  neutral-host fallback requests, duplicate-email races, and email delivery failures.
- External systems: browser or API caller, Next.js route handler, better-auth session API,
  tenant-host resolution helpers, PostgreSQL persistence, bcrypt hashing, member-number generator,
  membership-billing domain helpers, and email delivery.
- Trust boundaries: public HTTP request to protected route, route to session lookup, session and
  request tenant sources to tenant resolver, validated API DTO to FormData, FormData to
  registration core, transaction to durable membership/account writes, and post-commit result to
  outbound welcome email.
- Tenant isolation boundary: route rejects missing sessions, non-agent roles, host/session tenant
  mismatches, missing tenant context, and fallback tenant mismatches before the registration core
  runs; the core writes user, branch, agent attribution, client binding, and subscription state
  with the route-resolved tenant id.

## Existing Controls

- Authentication and authorization controls: rate limit runs before session work; missing session
  returns `401`; only `role === 'agent'` may proceed; non-agent, staff, admin, tenant-admin,
  branch-manager, super-admin, member, user, or missing roles return `403`.
- Tenant-scoping controls: the route compares host tenant and session tenant, resolves tenant from
  host/cookie/header/query sources with production-sensitive behavior, rejects missing tenant
  context, and requires the session tenant to match the resolved tenant before registration.
- Input validation and rate limits: route-level DTO validation requires email, name, role, plan,
  and password shape and maps invalid route bodies to `400`; registration-core validation requires
  full name, email, phone, password, and plan before writes; caller-provided role is not used to
  persist the created user's role.
- Storage or persistence controls: transactional retry wraps user, credential account, member
  number, active agent-client binding, and subscription writes; persisted user role is hard-coded to
  `member`; password is hashed before credential persistence; agent-assisted attribution requires a
  non-blank agent id.
- Audit, telemetry, or evidence controls: durable attribution records the assisting agent and
  creator type; client binding records active agent/member association; welcome email failure is
  isolated after the transaction and does not roll back registration state.
- Current proof files: route, core, schema, ownership-attribution, registration wrapper, tenant
  attribution E2E, and ownership-map files listed in this record.

## STRIDE Threat Table

| Category               | Threat                                                        | Existing control                                                              | Residual risk                                                                | Follow-up or owner                |
| ---------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| Spoofing               | Non-agent or unauthenticated caller creates a member.         | Session required; exact `agent` role required before body registration work.  | Compromised agent session can still initiate legitimate assisted signup.     | Auth incident response lane.      |
| Tampering              | Caller forces tenant, branch, plan, or role into wrong state. | Tenant agreement checks, plan enum validation, hard-coded member role writes. | Agent branch comes from session state and is not independently modeled here. | Agent onboarding owner accepted.  |
| Repudiation            | Agent denies creating or assisting a member.                  | `agentId`, `createdBy`, `assistedByAgentId`, and client binding are durable.  | Human-readable audit timeline coverage is outside this record.               | Audit/timeline architecture lane. |
| Information disclosure | Registration PII or password leaks through logs or docs.      | Password is hashed before account persistence; this record avoids raw data.   | Password exists in request/FormData memory; log redaction proof is separate. | Data lifecycle verification lane. |
| Denial of service      | High-volume signup attempts exhaust route or DB capacity.     | Route rate limit precedes session and body registration work.                 | Large-volume legitimate agent imports need separate load-budget proof.       | Performance regression gate lane. |
| Elevation of privilege | Caller-provided role creates agent/admin/member privilege.    | API core may accept a role field, but write core persists `role: 'member'`.   | Schema still accepts `agent` as input, which can confuse API consumers.      | Platform owner accepted.          |

## Verification

- Required local proof for this record: `git diff --check`, `pnpm docs:verify`,
  `pnpm plan:status`, `pnpm plan:audit`, `pnpm track:audit`, `pnpm repo:size:check`,
  `pnpm security:guard`.
- Runtime proof cited by this model exists in the route, core, schema, attribution, and test files
  listed in the identity section; this docs slice does not rerun or change those tests.
- Reviewer disposition must focus on whether the model is bounded to assisted member registration,
  accurately describes agent-only authorization and tenant agreement checks, and avoids claiming
  full registration, CRM import, notification, password reset, or load-test readiness.
- Explicitly skipped proof: heavy local E2E is not required because this slice is docs/register
  only.

## Result

- Decision: pass for the assisted-registration threat-model record.
- Blocking gaps: none for this documentation slice.
- Non-blocking gaps: compromised-agent-session response, human-readable audit timeline coverage,
  log redaction proof, agent import load budgets, and API role-field simplification remain outside
  this record.
- Accepted residual risks: assisted registration intentionally allows authenticated agents to
  create tenant-scoped member/account/subscription state; welcome email delivery is best-effort
  after durable registration succeeds.
- Follow-up slice: `ENT-TM09 Admin Verification Details Threat Model`.
- Owner sign-off: platform/agent-acquisition review through PR checks and review threads.

## Relationship To Enterprise Readiness

This record completes the assisted-registration surface required by `ENT-TM01`. The broader
threat-model lane still requires per-surface records for admin verification details and other
promoted sensitive surfaces.
