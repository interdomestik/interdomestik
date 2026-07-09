---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-09
related:
  - docs/plans/2026-07-09-mob-dg03-entry-evidence-acceptance.md
  - docs/plans/2026-07-08-mob-dg03-entry-evidence-blocker-resolution.md
  - docs/product/2026-07-03-mobile-copy-system.md
  - docs/product/2026-07-03-mobile-component-contracts-part-1.md
  - docs/reviews/2026-07-05-enterprise-transformation-register.md
---

# ENT-B04 MOB-02a Status-Sentence Catalog Evidence

> Status: accepted reviewer-portal evidence for `MOB-DG03` entry review. This
> document does not promote `MOB-02`, promote `MOB-02a`, authorize runtime work,
> edit app source, or approve broad Case Companion implementation.

## Reviewer Portal Custody

| Field                  | Value                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| Step                   | `ENT-B04`                                                          |
| Reviewer               | Gazmend                                                            |
| Submitted at           | `2026-07-09T10:32:39.071Z`                                         |
| Evidence reference     | `submissions/2026-07-09T10-32-39-583Z-ent-b04-gazmend/review.json` |
| Portal status endpoint | `https://reviewer-ecohub.vercel.app/api/status`                    |
| Complete?              | yes                                                                |

The earlier partial `ENT-B04` submission at
`submissions/2026-07-09T09-02-56-562Z-ent-b04-gazmend/review.json` is not used
as current authority because it contained only `B04-FORBIDDEN` and was not a
complete step submission.

## Accepted Items

| Item                | Portal decision | Repo-safe acceptance                                                                    |
| ------------------- | --------------- | --------------------------------------------------------------------------------------- |
| `B04-CATALOG-OWNER` | approve         | Catalog ownership and language review custody are accepted for `MOB-DG03` entry review. |
| `B04-STATUS-ROWS`   | approve         | The status-row catalog requirement is accepted for `MOB-DG03` entry review.             |
| `B04-AWAITING-DATE` | approve         | Awaiting-date copy handling is accepted for `MOB-DG03` entry review.                    |
| `B04-OVERDUE`       | approve         | Overdue variant handling is accepted for `MOB-DG03` entry review.                       |
| `B04-FORBIDDEN`     | approve         | Forbidden copy/promise boundaries are accepted for `MOB-DG03` entry review.             |

## Repo-Safe Scope Conclusion

For `MOB-DG03`, `ENT-B04` is no longer an open blocker. The accepted scope is a
member-facing status-sentence catalog for the future read-only `MOB-02a` display
foundation, bounded to:

- accepted owner categories only: `member`, `interdomestik`, `insurer`, and
  `court`;
- a complete status sentence rather than an internal status code;
- date or awaiting-date language for every displayable state;
- overdue variants where an overdue presentation exists;
- language coverage for `en`, `sq`, and `mk` in the reviewer-accepted portal
  submission.

The repository does not copy the full reviewer text from the portal in this
document. The safe authority record is the portal custody path plus the accepted
item set above.

## Runtime Boundary

`ENT-B04` does not authorize message-key edits, component work, notifications,
claim writers, Agreement Ceremony behavior, schema/RLS changes, or runtime SLA
promises. The later `MOB-02a` implementation must still prove catalog key
coverage and member rendering through tests before merge readiness.
