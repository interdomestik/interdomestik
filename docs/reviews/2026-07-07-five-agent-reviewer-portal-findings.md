---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-07
related:
  - docs/reviews/2026-07-07-parallel-agent-dispatch-reviewer-portal.md
  - docs/reviews/2026-07-07-reviewer-portal-hardening-audit.md
  - docs/reviews/2026-07-07-reviewer-portal-vercel-deployment-record.md
  - docs/reviews/2026-07-07-evidence-intake-processor.md
  - output/review/2026-07-06-mobile-uiux-review-interface/
---

# Five-Agent Reviewer Portal Findings

> Status: integrated review note. This file records sidecar findings and the
> main-thread integration decision. It does not authorize launch, runtime,
> Vercel deployment, or `MOB-01b`.

## Classification

Classified as `documentation/external-tracker-only` because the five agents
reviewed the standalone reviewer portal and preparation docs. Follow-up changes
stay within `docs/` and `output/review/`.

## Agent Results

| Agent    | Scope            | Main finding                                                                   |
| -------- | ---------------- | ------------------------------------------------------------------------------ |
| Bacon    | Vercel/access    | Use protected Vercel Preview only; do not rely on unguessable URLs             |
| Einstein | Upload/privacy   | Public Blob JSON and attachments are blocker risk for sensitive evidence       |
| Nash     | UX/accessibility | Add inline guidance, less jargon, visible upload warning, and non-color status |
| Raman    | Evidence/gates   | Normalize vocabulary; decide whether `ENT-A14` is hard or soft for `MOB-DG01B` |
| Boyle    | Verification     | Add local/API/negative/Vercel smoke matrix before sharing                      |

## Integration Decision

1. Public URL without protection remains blocked.
2. Sensitive uploads remain blocked by default, but internal-only reviewer use
   may enable low-sensitivity uploads deliberately with
   `REVIEW_PORTAL_ALLOW_UPLOADS=true`.
3. Uploads are now server-rejected by default unless `REVIEW_PORTAL_ALLOW_UPLOADS=true`.
4. A Vercel `middleware.js` Basic Auth option exists for protected preview use.
5. UI copy now warns reviewers to use evidence-center references for sensitive
   documents.
6. `MOB-DG01B` still cannot move until returned evidence and current authority
   exist.

## Environment Defaults

Use these for a protected reviewer deployment:

```text
REVIEW_PORTAL_AUTH_MODE=basic
REVIEW_PORTAL_BASIC_USER=<reviewer-user>
REVIEW_PORTAL_BASIC_PASSWORD_HASH=<sha256-password-hash>
REVIEW_PORTAL_ALLOW_UPLOADS=false
BLOB_READ_WRITE_TOKEN=<isolated-reviewer-portal-token>
```

For local-only testing, the local server also supports:

```text
REVIEW_PORTAL_BASIC_PASSWORD=<plain-local-test-password>
```

Do not use the local plain password variable in Vercel.

## Internal-Use Assumption

Arben confirmed the reviewer page is for internal Interdomestik use. This lowers
the privacy risk, but it does not make an unprotected public URL or public Blob
store equivalent to private evidence custody.

Operational interpretation:

- protected preview or app-level Basic Auth is still recommended;
- uploads may be enabled for internal reviewer convenience only after that
  decision is explicit;
- secrets, credentials, private channel URLs, tokens, raw member/claim/document
  identifiers, and payment identifiers still must not be uploaded;
- legal/financial documents can be referenced through the evidence center if the
  team wants stricter custody later.

Official Vercel docs confirm Blob stores support public/private modes and that
public Blob URLs are accessible to anyone with the URL:

- https://vercel.com/docs/vercel-blob
- https://vercel.com/docs/vercel-blob/using-blob-sdk

## Remaining Before Sharing

- Run the full verification matrix after this hardening patch. Done for local
  and Vercel production alias on 2026-07-07.
- Decide whether Vercel Deployment Protection is available; if yes, prefer it.
  Result: deployment-specific URLs are behind Vercel SSO, while the production
  alias uses app-level Basic Auth for Gazmend access.
- If app-level Basic Auth is used, share URL and password through separate
  channels. URL is recorded in the deployment record; password is outside repo.
- If the team accepts internal-only upload risk, set
  `REVIEW_PORTAL_ALLOW_UPLOADS=true` only on the protected reviewer deployment.
  Done for production and preview.
- Resolve the `ENT-A14` hard/soft gate question before `MOB-DG01B` finalization.
