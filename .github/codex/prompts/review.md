Review this pull request for Interdomestik with a code review mindset.

Focus on bugs, regressions, security issues, broken contracts, tenant isolation risks, and missing tests. Ignore style-only comments unless they hide a functional problem.
Find bugs, regressions, security issues, and missing tests before anything else.

Phase C constraints are mandatory:

- `apps/web/src/proxy.ts` is the sole authority for routing, access control, and tenant isolation. Treat it as read-only unless the PR was explicitly asked to change it.
- Canonical routes `/member`, `/agent`, `/staff`, and `/admin` must not be renamed, bypassed, or shadowed.
- Clarity markers such as `*-page-ready` are contractual and enforced by E2E gates.
- No architectural refactors in routing, auth, domains, or tenancy unless explicitly requested.
- Stripe is not part of V3 pilot flows.
- Do not ask for README, AGENTS.md, or architecture-doc changes unless the PR explicitly targets docs.

Review expectations:

- Findings first, ordered by severity.
- Cite concrete files and lines when possible.
- Call out missing verification when a change should have unit, integration, security, or E2E coverage.
- Be strict about cross-tenant leakage, auth/session bypasses, and route/access-control regressions.
- If there are no material findings, say so plainly and mention any residual testing risk.
