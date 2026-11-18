# T-503 Evidence Intake Package

Created: 2026-07-02
Posture: evidence-ready only

This package prepares the final T-503 release evidence intake path. It does not
mark any G01-G10 gate as complete, waived, approved, supplied, or verified.

## Use This Package For

- collecting real G04, G05, G09, and G10 production release-cycle artifacts;
- creating a signed waiver artifact when an owner explicitly accepts a controlled
  exception instead of supplying the final artifact;
- computing SHA-256 values for artifacts before editing
  `docs/release/production-evidence.yaml`;
- reviewing whether the release evidence is strong enough to unblock a later
  current-authority gate.

## Do Not Use This Package For

- bypassing `pnpm release:evidence:check`;
- replacing claimant-specific POA, consent, or fee evidence with sponsor-level
  documents;
- marking final paid, final recovered, final closed, or destructive T-503 status
  removal before current authority explicitly approves it;
- changing runtime, auth, tenancy, routing, RLS, schema, billing, or
  `apps/web/src/proxy.ts`.

## Files

- `qualifying-evidence-checklist.md`: what qualifies for each missing gate.
- `manifest-patch-example.yaml`: copy-only example for the release manifest.
- `waiver-templates/G04-bank-payment-proof-waiver.md`
- `waiver-templates/G05-600-mkd-reconciliation-waiver.md`
- `waiver-templates/G09-poa-consent-terms-waiver.md`
- `waiver-templates/G10-closure-evidence-waiver.md`

## Intake Commands

Evidence files and signers' names never enter the repository. Keep each real
artifact or signed waiver in the private evidence store, outside the
repository, and compute its hash there:

```bash
shasum -a 256 <evidence-store>/<artifact-file>
```

Then update only the matching gate in `docs/release/production-evidence.yaml`
with:

- `status: supplied`, `approved`, `verified`, or `waived`;
- the matching `required_artifacts[*].file` (the plain file name in the store);
- the matching `required_artifacts[*].sha256`;
- signoff `signer_ref` (the reference of the signoff record in the store, never
  a name or email), role, and signed date.

Preserve the existing gate entry shape, including `id`, `description`, `owner`,
and any unrelated artifacts. Do not replace a full gate entry with only the
partial fields shown in the example.

Finally run:

```bash
pnpm release:evidence:check --evidence-root <evidence-store>
```

The command must fail until every G01-G10 gate has a non-pending passing status,
a valid signoff and a well-formed SHA-256 per file. With `--evidence-root` it
also requires every file to exist in the store with a matching SHA-256; without
it, the check reports the files as not verified. Run it on a private evidence
directory that nobody else can change while the check runs.
