# IDA-DG49 — T-115 OD#17 GitHub OIDC Preview canary access

Status: exact approved capability authority; runtime unauthorized.

Base main: `e29811361295f3dc71c051b9d9a97a7ba2874f16`.

Arben approved this gate at 10,199 bytes / SHA-256
`6b66ffdfcf6645cbe1bfe8528578d5bf3518d50a090914240a6d25dc8ebf4a08`.
The content-addressed task artifact is the full immutable contract; this concise
record grants no broader authority.

After a separately exact-approved runtime receipt, permit only one Vercel
`interdomestik-web` GitHub Actions Trusted Source, one manual GitHub Ubuntu
workflow, the OD#17 controller/tests, workflow-contract test and conditional
size metadata. The source must constrain issuer
`https://token.actions.githubusercontent.com`, audience
`https://github.com/interdomestik`, exact account/repository, protected-main
workflow and Preview. The job may verify only an open same-repository non-fork
OD#17 PR through GitHub API and an exact full head SHA; it never executes PR
code. It may egress only to GitHub REST, GitHub OIDC and the exact HTTPS Preview
URL. It uses job-local read/OIDC permissions, no secrets or environment, masks
the JWT, and never writes it to arguments/files/outputs/artifacts/logs/errors.

The runtime receipt must bind current main, DG47/DG48/DG49, immutable workflow,
PR API/head/deployment/health identities, Trusted Source normalized tuple and ID,
Preview binding ID, run ID and value-free claim fingerprint. Stop if the full
tuple cannot be enforced. Rollback removes only the receipt-owned unambiguous
source/binding and verifies absence by provider ID and full tuple. No protection,
production, route, UI, auth, schema, AI OS or existing-CI change is authorized.
