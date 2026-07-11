---
plan_role: input
status: active
source_of_truth: false
owner: security
last_reviewed: 2026-07-11
related:
  - docs/product/2026-07-09-mob-03a-authority-evidence-request-part-b.md
  - docs/plans/ent-tm03-authenticated-claim-evidence-uploads-threat-model-2026-06-06.md
  - docs/plans/ent-tm04-document-signed-urls-and-downloads-threat-model-2026-06-06.md
  - docs/plans/ent-tm05-share-packs-threat-model-2026-06-06.md
  - docs/security/storage-access-baseline.md
---

# MOB-03a Targeted Threat Recheck

> Status: recommended evidence for independent reviewer disposition. This is not
> production readiness, runtime authority, a DPIA, or proof of a completed DSR
> rehearsal.

## Exact Design Boundary Rechecked

- Interdomestik MK only.
- Non-medical car/property Vault + Consent display foundation.
- Display only: document state, category, and last-updated timestamp.
- No raw document, document link, signed URL, storage path, raw identifier,
  payment data, medical data, private legal data, or staff-private note.
- Member access is own-case only; authorized internal access is case-scoped.
- Sponsor, payer, partner, and every external party are excluded.
- Revoked or erased subjects retain only non-sensitive skeleton context; subject
  metadata and document links are hidden.
- No claim/status mutation, upload, share pack, consent writer, outbox write,
  schema/RLS migration, auth/proxy change, or billing behavior.

## Targeted Recheck

| Area                     | Recheck result   | Required boundary                                                                                     |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------------------------------- |
| Document access          | Clear for review | No content or link; own-case/case-scoped metadata only.                                               |
| Consent revocation       | Clear for review | Hide subject metadata and links after revocation.                                                     |
| Sponsor/payer visibility | Clear for review | External visibility remains excluded.                                                                 |
| Erased-subject rendering | Clear for review | Preserve only non-sensitive skeleton context.                                                         |
| Audit trail              | Clear for review | This display slice creates no new writer; runtime proof must preserve existing access/audit controls. |

## Evidence Considered

- `ENT-TM03`: upload threats remain outside this display-only scope.
- `ENT-TM04`: signed URL/download threats are avoided because links, URLs, paths,
  and document content are excluded.
- `ENT-TM05`: bearer sharing is avoided because sponsor, payer, partner, and
  share-pack exposure are excluded.
- Storage baseline: tenant-prefixed storage and signed-URL controls remain
  implementation constraints; this slice does not call storage.
- `MOB-02a` no-mutation proof: erased-subject skeleton rendering is the accepted
  design precedent, without claiming end-to-end DSR rehearsal.

## Recommendation

`clear` for independent review of the exact design boundary above. This result
does not auto-approve the packet. Gazmend Abazi selects the independent Business /
Governance disposition after Sanja Jovanovska confirms the Legal / Privacy
boundary. Arben Lila is consulted on platform constraints. Runtime still requires
a separate canonical `CA+DG`.

Stop and reopen the gate if implementation requires document content or links,
external-party visibility, medical/injury data, storage access, a writer,
schema/RLS, auth/proxy, KS/AL exposure, or any other excluded surface.
