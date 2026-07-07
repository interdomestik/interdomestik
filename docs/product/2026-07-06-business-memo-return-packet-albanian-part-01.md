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

# Paketa E Kthimit Per Memo 1 Dhe Memo 2 - Part 1

Back to index: [2026-07-06-business-memo-return-packet-albanian.md](./2026-07-06-business-memo-return-packet-albanian.md)

# Paketa E Kthimit Per Memo 1 Dhe Memo 2

> Status: udhezim kthimi per vendime biznesi. Ky dokument nuk zgjedh opsion,
> nuk nenshkruan memo, nuk ndryshon cmim, nuk ndryshon copy, nuk promovon
> `MOB-05a` ose `MOB-02`, dhe nuk jep runtime authority.

## Qellimi

Interdomestik ka dy vendime biznesi qe bllokojne zhvillimin e ardhshem te
platformes:

- Memo 1: cfare do te thote "no win, no fee" kur ka kosto eksperti/gjykate dhe
  rasti humbet.
- Memo 2: a premtojme handler me emer, case team, apo model te fazuar.

Keto vendime nuk jane kod. Por nese mungojne, platforma nuk mund te ndertoje
me ndergjegje Fee Math Sheet, handler copy, agreement ceremony, ose case
companion.

## Rregulli Kryesor

Kthe nje vendim te plote ose kthe `blocked`. Mos e le vendimin gjysme te hapur.

Nje memo pranohet vetem nese ka:

- nje opsion te vetem te zgjedhur;
- emrin dhe rolin e signer-it;
- fushat financiare/ops te plotesuara;
- nese duhet, counsel/L5 ose ops/product input;
- arsyetim te shkurter;
- date;
- reference nenshkrimi ose PDF te nenshkruar.

## Memo 1 - Expert Cost On Loss

### Pyetja

Nese Interdomestik miraton nje kosto eksperti/gjykate dhe rasti humbet, a e
paguan anetari ate kosto?

### Pse Na Duhet

Fee Math Sheet duhet te tregoje te verteten para nenshkrimit. Nese themi
"recover nothing, pay nothing", por ne fakt eksperti mbetet per anetarin, kjo e
demton besimin. Ky vendim kontrollon `MOB-05a`, `fees.*`, `ProposalCard` dhe
Agreement Ceremony.

### Zgjidh Vetem Nje Opsion

| Opsioni | Kuptimi                                                                             | Kur eshte i pranueshem                                                  |
| ------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| A       | Interdomestik i mbulon kostot e aprovuara kur rasti humbet.                         | Vetem nese finance pranon range/cap dhe counsel/L5 e pranon wording-un. |
| B       | Success fee hiqet, por kostot e treta mbeten te anetarit.                           | Vetem nese copy e tregon worst case qarte para nenshkrimit.             |
| C       | Interdomestik mbulon deri ne nje cap; mbi cap eshte at-risk me aprovim te anetarit. | Vetem nese cap-i dhe boundary shfaqen qarte ne UI.                      |

Rekomandimi i dokumentit burim eshte A me cap dhe review periodik, por signer-i
duhet ta pranoje vetem nese kostoja eshte realisht e perballueshme dhe counsel
e pranon wording-un.

### Fushat Qe Duhet Te Kthehen

| Fushe                    | Pse duhet                                                | Pergjigjja |
| ------------------------ | -------------------------------------------------------- | ---------- |
| Signer name/role         | Kush e merr pergjegjesine biznesore                      |            |
| Opsioni i zgjedhur       | A / B / C, vetem nje                                     |            |
| Cost range               | Sa pritet te kushtoje eksperti/gjykata                   |            |
| Currency                 | P.sh. EUR                                                |            |
| Cap amount               | Shuma maksimale nese A ose C perdor cap                  |            |
| Finance input            | Kush e pranoi range/cap ose kush e bllokoi               |            |
| Counsel/L5 input         | Kush e pranoi wording-un ose kush e bllokoi              |            |
| Fee promise consequence  | unqualified / qualified / capped                         |            |
| Rationale                | Pse ky opsion eshte i ndershem per biznesin dhe anetarin |            |
| Date/signature reference | Prova qe vendimi eshte miratuar                          |            |

### Kur Bllokohet Memo 1

Memo 1 bllokohet nese:

- jane zgjedhur me shume se nje opsion;
- nuk ka cost range;
- A ose C thote cap, por cap mungon;
- nuk ka finance input;
- nuk ka counsel/L5 path per wording-un;
- vendimi lejon copy absolute, por realisht kostoja i mbetet anetarit.

## Memo 2 - Handler Model

### Pyetja

A mund t'i premtojme anetarit nje handler me emer, apo duhet te themi "case
team", apo ta bejme gradualisht per dege qe e fitojne kete te drejte?

### Pse Na Duhet

Emri i njeriut rrit besimin, por nese ai person nuk pergjigjet ose ndryshon
pa sqarim, besimi prishet me shpejt. Ky vendim kontrollon `MOB-02`, home screen,
case companion, message headers, handover copy dhe privacy te stafit.
