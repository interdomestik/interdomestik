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

After a real artifact or signed waiver is placed under
`docs/release/evidence/`, compute its hash:

```bash
shasum -a 256 docs/release/evidence/<artifact-file>
```

Then update only the matching gate in `docs/release/production-evidence.yaml`
with:

- `status: supplied`, `approved`, `verified`, or `waived`;
- the artifact path;
- the SHA-256 hash;
- signoff name, role, and signed date.

Finally run:

```bash
pnpm release:evidence:check
```

The command must fail until every G01-G10 gate has a non-pending passing status,
valid signoff, existing artifact path, and matching SHA-256.
