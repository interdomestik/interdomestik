---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-05
related:
  - docs/product/2026-07-03-business-decision-memos.md
  - docs/product/2026-07-06-business-memo-return-packet-albanian.md
  - docs/product/2026-07-06-business-memo-signature-intake.md
  - docs/product/2026-07-05-memo1-expert-cost-on-loss-decision-record.md
  - docs/product/2026-07-05-memo2-handler-model-decision-record.md
  - docs/reviews/2026-07-05-week1-human-action-packet.md
---

# Business Memo Signing Packet

> Status: **human-action packet only.** This packet signs nothing and grants no
> runtime authority. It exists so ENT-A02 and ENT-A03 can be completed by real
> decision makers without ambiguity.

## Package Contents

| Item                                                                   | Purpose                                        |
| ---------------------------------------------------------------------- | ---------------------------------------------- |
| `docs/product/2026-07-03-business-decision-memos.md`                   | Full decision context and recommended defaults |
| `docs/product/2026-07-06-business-memo-return-packet-albanian.md`      | Reviewer/signer-facing return instructions     |
| `docs/product/2026-07-05-memo1-expert-cost-on-loss-decision-record.md` | Signature record for ENT-A02                   |
| `docs/product/2026-07-05-memo2-handler-model-decision-record.md`       | Signature record for ENT-A03                   |

## Signing Order

0. Read `docs/product/2026-07-06-business-memo-return-packet-albanian.md` so
   the returned decision has all fields required for acceptance.
1. Finance gives a defensible expert/court-cost range and cap recommendation.
2. Counsel / L5 owner reviews the fee-promise consequence of Memo 1.
3. Accountable decider signs Memo 1.
4. Ops/product state whether stable named-handler assignment is true today.
5. Accountable ops decider signs Memo 2.
6. The signed files are committed, and the register rows flip to `done(path)`.

## Albanian Instructions

Për Memo 1: zgjidhni vetëm një opsion A, B ose C. Plotësoni vlerësimin financiar
për koston e ekspertit/gjykatës, kufirin maksimal nëse ka, arsyen e vendimit,
emrin e personit që u konsultua nga financa dhe emrin e personit ligjor/L5.
Nënshkruani vetëm kur fjalia për "pa fitim, pa pagesë" është e vërtetë sipas
opsionit të zgjedhur.

Për Memo 2: zgjidhni vetëm një model A, B ose C. Nëse zgjidhet C, shkruani
qartë pragun e stabilitetit të degës dhe pragun e SLA-së para se një degë të
mund të përdorë emër të handler-it. Nënshkruani vetëm nëse operacionet realisht
mund ta mbajnë premtimin që do të shfaqet te anëtari.

## Completion Rule

Step 4 is prepared when this packet exists. Step 4 is complete only after both
decision records are signed, dated, accepted by
`docs/product/2026-07-06-business-memo-signature-intake.md`, and committed with
any required finance, counsel, and ops fields filled.
