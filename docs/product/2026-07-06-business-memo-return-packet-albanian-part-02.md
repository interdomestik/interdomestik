---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-06
related:
  - docs/product/2026-07-03-business-decision-memos.md
  - docs/product/2026-07-05-business-memo-signing-packet.md
  - docs/product/2026-07-06-business-memo-signature-intake.md
  - docs/product/2026-07-05-memo1-expert-cost-on-loss-decision-record.md
  - docs/product/2026-07-05-memo2-handler-model-decision-record.md
  - docs/plans/2026-07-06-mob-05a-mob-02-prep-worksheet.md
---

# Paketa E Kthimit Per Memo 1 Dhe Memo 2 - Part 2

> Status: Non-authoritative support document.

Back to index: [2026-07-06-business-memo-return-packet-albanian.md](./2026-07-06-business-memo-return-packet-albanian.md)

### Zgjidh Vetem Nje Opsion

| Opsioni | Kuptimi                                                               | Kur eshte i pranueshem                                                      |
| ------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A       | Named handler nga launch.                                             | Vetem me stabilitet real, SLA tracking, handover moment dhe privacy review. |
| B       | Case team nga launch.                                                 | Kur nuk mund te garantojme njeri stabil me emer.                            |
| C       | Launch me case team; named handler vetem kur dega e fiton me metrics. | Rekomandimi i burimit; kerkon thresholds te qarta.                          |

Rekomandimi i dokumentit burim eshte C, sepse e mban launch-in te ndershem dhe
lejon named handler kur operacionet e provojne me evidence.

### Fushat Qe Duhet Te Kthehen

| Fushe                       | Pse duhet                                        | Pergjigjja |
| --------------------------- | ------------------------------------------------ | ---------- |
| Signer name/role            | Kush e merr pergjegjesine ops                    |            |
| Opsioni i zgjedhur          | A / B / C, vetem nje                             |            |
| Stable assignment reality   | A mund ta mbajme te njejtin person gjate rastit? |            |
| Stability threshold         | P.sh. >=90% per 2 muaj, nese A/C                 |            |
| SLA threshold               | Koha dhe periudha matese per pergjigje           |            |
| Handover rule               | Si shpjegohet nderrimi i handler-it              |            |
| Staff identity/privacy note | A lejohet emri/foto e stafit publikisht?         |            |
| Ops/product input           | Kush e pranoi ose bllokoi modelin                |            |
| Rationale                   | Pse ky model eshte i ndershem per anetarin       |            |
| Date/signature reference    | Prova qe vendimi eshte miratuar                  |            |

### Kur Bllokohet Memo 2

Memo 2 bllokohet nese:

- jane zgjedhur me shume se nje opsion;
- A zgjidhet pa stability/SLA/handover/privacy proof;
- C zgjidhet pa thresholds;
- vendimi premton named handler, por ops nuk mund ta mbaje;
- nuk ka signer me rol te qarte.

## Si Te Kthehet Paketa

1. Ploteso Memo 1 decision record:
   `docs/product/2026-07-05-memo1-expert-cost-on-loss-decision-record.md`.
2. Ploteso Memo 2 decision record:
   `docs/product/2026-07-05-memo2-handler-model-decision-record.md`.
3. Bashkangjit ose ruaj PDF/reference te nenshkrimit.
4. Prano ose blloko kthimin ne:
   `docs/product/2026-07-06-business-memo-signature-intake.md`.
5. Vetem pas pranimit, update:
   `docs/plans/2026-07-06-mob-05a-mob-02-prep-worksheet.md`.

## Vendimi I Pranimit Nga Interdomestik

Kjo pjese plotesohet nga Arben/Codex pas kthimit.

| Kontroll                          | Memo 1                 | Memo 2                 |
| --------------------------------- | ---------------------- | ---------------------- |
| Exactly one option selected       | pass / correct / block | pass / correct / block |
| Accountable signer present        | pass / correct / block | pass / correct / block |
| Required inputs present           | pass / correct / block | pass / correct / block |
| Consequence mapped to future gate | pass / correct / block | pass / correct / block |
| Date/signature reference present  | pass / correct / block | pass / correct / block |
| Safe to store in repo             | pass / correct / block | pass / correct / block |

Verdict:

- [ ] Memo 1 accepted.
- [ ] Memo 1 returned for correction.
- [ ] Memo 1 blocked.
- [ ] Memo 2 accepted.
- [ ] Memo 2 returned for correction.
- [ ] Memo 2 blocked.

Notes:

Accepted by:

Date:

## Authority Boundary

Pranimi i memove nuk e nis implementimin. `MOB-05a` dhe `MOB-02` mbeten te
bllokuara derisa current authority/design gate te promovoje saktesisht nje
slice konkrete.
