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
- the matching `required_artifacts[*].file` (the plain file name in the store,
  starting with the gate id, for example `G04-`);
- the matching `required_artifacts[*].sha256`;
- signoff `signer_ref` `T503-<gate id>-SIGNOFF` (the signoff record in the store
  carries that reference; never a name or email), role, and signed date
  (`YYYY-MM-DD`).

Preserve the existing gate entry shape, including `id`, `description`, `owner`,
and any unrelated artifacts. Do not replace a full gate entry with only the
partial fields shown in the example.

Keep the manifest in its canonical form: block style, two-space indents, values
unquoted where YAML allows, and no comments, anchors or aliases below the fixed
two-line header. Role, owner, description and file names are free text; the
check cannot tell a name from a title, so the reviewer of the manifest diff
confirms that they hold none.

Finally run:

```bash
pnpm release:evidence:verify <evidence-store>
```

The command must fail until every G01-G10 gate has a non-pending passing status,
a valid signoff and a well-formed SHA-256 per file, and every file exists in the
store with a matching SHA-256. `pnpm release:evidence:check` checks the manifest
alone and never verifies files, whatever options it is given. Write options
after the script name: pnpm takes options written before it as its own settings
and may refuse or silently drop them. Run it on a private evidence directory
that nobody else can change while the check runs.
