---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-09
related:
  - docs/reviews/2026-07-07-evidence-intake-processor.md
  - docs/reviews/2026-07-07-gazmend-return-control-room-part-01.md
  - docs/plans/2026-07-08-mob-dg03-entry-evidence-blocker-resolution.md
---

# MOB-DG03 Reviewer Portal Evidence Steps

> Status: reviewer-portal evidence intake record only. This does not promote
> `MOB-02`, promote `MOB-02a`, create `MOB-DG03`, authorize runtime work, or
> edit Interdomestik app source.

## Deployment

| Field                     | Value                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------- |
| Reviewer alias            | `https://reviewer-ecohub.vercel.app`                                                   |
| New production deployment | `https://interdomestik-reviewer-portal-flne815qb-ecohub.vercel.app`                    |
| Vercel inspect URL        | `https://vercel.com/ecohub/interdomestik-reviewer-portal/Bj5H59r3zowEKmx4UbWBs64LanBV` |
| Deployment method         | `vercel deploy --prebuilt --prod`; alias reassigned with `vercel alias set`            |
| Runtime app touched       | no; standalone reviewer portal output only                                             |

## Added Evidence Steps

| Step                     | Purpose                                                                                                                                                  | Gate impact                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `ENT-B04`                | Albanian reviewer intake for status-sentence catalog completeness, en/sq/mk rows, owners, awaiting-date, and overdue variants.                           | May close the `ENT-B04` blocker after processor acceptance; no runtime authority.                          |
| `ENT-B05`                | Albanian reviewer intake for G09 / Next Step SLA reconciliation, business hours, channels, complete-pack definition, date rules, and forbidden promises. | May close the `ENT-B05` blocker after processor acceptance; no runtime authority.                          |
| `MOB02A-MEMO2-MAPPING`   | Albanian reviewer intake for selecting exactly one Memo 2 display model: named handler, case team, or hybrid threshold.                                  | May close the Memo 2 display-model blocker after processor acceptance; no named-handler runtime inference. |
| `MOB02A-READMODEL-PROOF` | Albanian platform/QA intake for read-only/no-mutation proof, allowed read sources, exactly-one-next-step, erased rendering, and future test gates.       | May close read-model proof blocker after processor acceptance; no runtime authority.                       |

## Fillable Documents

Albanian checkbox/write-in templates were created for offline or PDF-assisted
review. The portal remains the preferred structured intake path.

| Document                               | Source                                                                |
| -------------------------------------- | --------------------------------------------------------------------- |
| ENT-B04 status-sentence catalog        | `docs/product/2026-07-09-ent-b04-mob-02a-status-sentence-catalog.md`  |
| ENT-B05 G09 / SLA reconciliation       | `docs/product/2026-07-09-ent-b05-g09-next-step-sla-reconciliation.md` |
| Memo 2 display-model mapping           | `docs/product/2026-07-09-memo2-mob-02a-display-model-mapping.md`      |
| MOB-02a read-model / no-mutation proof | `docs/plans/2026-07-09-mob-02a-read-model-no-mutation-proof.md`       |

## Verification

| Check                                          | Result                                                                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `node --check .../modules.js`                  | pass                                                                                                               |
| `node --check .../app.js`                      | pass                                                                                                               |
| `node --check .../uploads.js`                  | pass                                                                                                               |
| Mock intake route test                         | pass; B04, B05, Memo2 mapping, read-model proof route to their own steps; raw Memo 2 still routes to `ENT-A02-A03` |
| Fresh-browser smoke                            | pass; new user lands on `ENT-B04`, direct-open steps are clickable, concrete recommendation text is visible        |
| Browser console smoke                          | pass; 0 errors / 0 warnings                                                                                        |
| `curl .../api/status` and `curl .../api/draft` | `200`; function bundles include `@vercel/blob`                                                                     |
| `pnpm docs:verify`                             | pass                                                                                                               |
| `curl -I https://reviewer-ecohub.vercel.app`   | `HTTP/2 200` from Vercel                                                                                           |

## Runtime Notes

- `ENT-B04`, `ENT-B05`, `MOB02A-MEMO2-MAPPING`, and
  `MOB02A-READMODEL-PROOF` remain directly open even when earlier evidence
  steps are already closed.
- Server draft restore is opt-in with `?resumeDraft=1`; the normal reviewer
  URL starts from the first open evidence step so stale global draft state does
  not force reviewers into an old correction workflow.
- System recommendations for the new steps are concrete orientation text only:
  each reviewer still chooses `Mirato`, `Kërkon ndryshim`, or `Blloko`.

## Authority Boundary

Returned portal evidence must still be processed through
`docs/reviews/2026-07-07-evidence-intake-processor.md`. Runtime starts only
after repo current-authority/design-gate selection promotes exactly one concrete
slice and the resolver returns `activeSlice.id=MOB-02a`.
