---
plan_role: input
status: active
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-08
related:
  - docs/product/2026-07-06-business-memo-signature-intake.md
  - docs/plans/2026-07-06-mob-05a-mob-02-prep-worksheet.md
  - docs/product/2026-07-05-memo1-expert-cost-on-loss-decision-record.md
  - docs/plans/2026-07-08-memo1-finance-cap-evidence-addendum-appendix.md
---

# Aneks Memo 1 - Financat Dhe Shpenzimet Ne Rruge Gjyqesore

> Status: repo-safe summary for signed external evidence. Dokument mbeshtetes,
> jo autoritet runtime. Ky aneks kompleton evidencen financiare per Memo 1 dhe
> shpenzimet ne rruge gjyqesore, por nuk autorizon runtime work, public wording,
> MOB-05a, ose implementim ne repository. Signed evidence is stored in the
> reviewer portal for `ENT-A02-A03` / `MEMO1-FINANCE`.

## 1. Identiteti I Evidences

| Fushe                       | Vlera                                                                                                                                                                                                                                                    |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File i Memo 1 te nenshkruar | `Mem01_rdc.pdf`                                                                                                                                                                                                                                          |
| Data e Memo 1               | 2026-07-07                                                                                                                                                                                                                                               |
| Evidence ne portal          | Reviewer portal export `ENT-A02-A03`; latest signed addendum correction path `corrections/2026-07-08T12-08-32-309Z-ent-a02-a03-gazmend/review.json`; previous Memo 1 evidence ref `corrections/2026-07-07T21-05-08-212Z-ent-a02-a03-gazmend/review.json` |
| Hash i PDF te nenshkruar    | SHA-256 `1c258983a9d54d60b618cad8ec07b24c57d0c5e3532a35b9842628f59e84f8d0`                                                                                                                                                                               |
| Shteti / scope              | MK / North Macedonia                                                                                                                                                                                                                                     |
| Gate i ardhshem i lidhur    | MOB-05a Fee Math / ProposalCard copy gate                                                                                                                                                                                                                |

## 2. Modeli Financiar I Zgjedhur

**Modeli i zgjedhur:** model i kualifikuar / hibrid per rrugen gjyqesore.

Ky aneks **nuk** aprovon premtim publik qe klienti nuk paguan asnje kosto te
jashtme ne cdo rast te humbur. Para se rasti te kaloje ne rruge gjyqesore,
Interdomestik dhe klienti duhet te merren vesh me shkrim per shpenzimet e
procesit gjyqesor.

## 3. Pergjegjesia Per Shpenzimet Gjyqesore

| Kosto / pune                                                                                          | Pergjegjesia default                                     | Rregulli                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Perfaqesimi juridik / perfaqesimi nga avokati                                                         | Interdomestik                                            | Mbulohen nga Interdomestik kur marreveshja per rrugen gjyqesore e konfirmon scope-in.                                                                                      |
| Puna e avokatit, perpilimi i padise, shtojcat e padise, shkresat dhe parashtresat e lidhura me padine | Interdomestik                                            | Mbulohen nga Interdomestik kur lidhen me rastin e aprovuar per rruge gjyqesore.                                                                                            |
| Prezenca e avokatit ne seanca gjyqesore                                                               | Interdomestik                                            | Mbulohen nga Interdomestik kur marreveshja e konfirmon perfaqesimin.                                                                                                       |
| Taksa / tarifa per padi                                                                               | Klienti, pervec nese marreveshja me shkrim thote ndryshe | Duhet te shpaloset dhe aprovohet me shkrim para dorezimit te padise.                                                                                                       |
| Taksa / tarifa per vendim gjyqesor                                                                    | Klienti, pervec nese marreveshja me shkrim thote ndryshe | Duhet te shpaloset dhe aprovohet me shkrim para krijimit te kostos.                                                                                                        |
| Super-ekspertiza / ekspertiza gjyqesore                                                               | Sipas marreveshjes me shkrim                             | Klienti mund te mbuloje pjesen e dakorduar. Nese rasti ka qene te Interdomestik ne fazen para-gjyqesore, Interdomestik mund ta paguaje ekspertizen gjyqesore paraprakisht. |
| Rimbursimi i ekspertizes/kostove qe Interdomestik i ka paguar paraprakisht                            | Interdomestik                                            | Nese vendimi gjyqesor i rimburson kostot qe Interdomestik i ka paguar paraprakisht, ai rimbursim i kthehet Interdomestikut.                                                |
| Cdo kosto tjeter e jashtme                                                                            | Vetem me aprovim te vecante me shkrim                    | Asnje kosto tjeter e jashtme nuk behet kosto e klientit pa aprovim paraprak me shkrim.                                                                                     |

## 4. Range Planifikimi Dhe Baze Tarifore

Keto jane range planifikimi per evidence dhe wording te produktit. Marreveshja e
nenshkruar per rrugen gjyqesore e kontrollon shumen reale per secilin rast.

| Kosto                               | Range planifikimi | Valuta | Baza / burimi                                                                    |
| ----------------------------------- | ----------------: | ------ | -------------------------------------------------------------------------------- |
| Opinion / vleresim eksperti         |           150-300 | EUR    | Tarife / vleresim rasti, per t'u konfirmuar per rastin konkret.                  |
| Tarife gjyqesore ose administrative |            30-100 | EUR    | Tarife gjyqesore / vleresim rasti, per t'u konfirmuar per parashtresen konkrete. |
| Perkthim / noterizim                |            10-100 | EUR    | Tarife perkthimi/noteri, vetem nese nevojitet per rastin.                        |
| Kosto tjeter e jashtme              |               N/A | N/A    | Kerkohet aprovim i vecante me shkrim para perdorimit.                            |

## 5. Vendimi Per Cap / No-Cap

**Pozicioni i zgjedhur:** Other - ndarje e shpenzimeve ne marreveshje me
shkrim per rrugen gjyqesore.

Nuk ka premtim te pergjithshem publik "zero external cost". Modeli i shpenzimeve
ne rruge gjyqesore kontrollohet nga marreveshja me shkrim para se te filloje
rruga gjyqesore. Interdomestik mbulon punen juridike te listuar me lart kur
marreveshja e konfirmon scope-in. Shpenzimet fikse te procesit gjyqesor, taksat
gjyqesore, tarifat per vendim dhe pjeset e dakorduara te super-ekspertizave mund
te mbeten pergjegjesi e klientit, pervec nese marreveshja me shkrim thote
ndryshe.

**Owner i aprovimit:** Business owner / CEO plus finance owner. Counsel/L5
review kerkohet para se ky model te perdoret ne public wording ose app copy.

**Periudha e rishikimit:** para cdo marreveshjeje per rruge gjyqesore, dhe se
paku cdo tremujor per product-copy dhe finance exposure review.

## 6. Pasoja Per Premtimin E Tarifes

**Pasojat e zgjedhura:** qualified no-success-fee / court-path cost wording.

Kuptimi i lejuar:

- Interdomestik mund te thote qe nuk ka success fee per Interdomestik nese nuk
  ka rikuperim.
- Interdomestik nuk guxon te thote ose te nenkuptoje qe te gjitha kostot e
  jashtme te rruges gjyqesore jane gjithmone zero per klientin.
- Cdo kosto fikse gjyqesore, takse, tarife vendimi, super-ekspertize ose kosto
  tjeter e jashtme duhet te shpaloset dhe te aprovohet me shkrim para se te
  behet kosto e klientit.

## 7. Approved Public Wording

### Albanian

Para se rasti te hyje ne rruge gjyqesore, Interdomestik dhe klienti merren
vesh me shkrim per shpenzimet gjyqesore. Interdomestik zakonisht mbulon
perfaqesimin juridik, punen e avokatit, perpilimin e padise, shtojcat dhe
shkresat e lidhura me padine, si dhe prezencen e avokatit ne seancat
gjyqesore. Klienti zakonisht mbulon shpenzimet fikse te procesit gjyqesor,
si taksat per padi, taksat per vendim gjyqesor dhe pjesen e dakorduar te
super-ekspertizave, pervec nese marreveshja me shkrim thote ndryshe. Nese
Interdomestik paguan shpenzime te ekspertizes gjyqesore, cdo rimbursim i
njohur me vendim gjyqesor per ato shpenzime i kthehet Interdomestikut.

### English Control Translation

Before a case enters the court path, Interdomestik and the client agree the
court-process costs in writing. Interdomestik usually covers legal
representation, attorney work, lawsuit drafting, annexes and submissions related
to the lawsuit, and attorney attendance at court hearings. The client usually
covers fixed court-process costs, such as lawsuit filing fees, court-decision
fees, and the agreed part of super-expertise costs, unless the written agreement
says otherwise. If Interdomestik pays court-expertise costs, any court-awarded
reimbursement for those costs returns to Interdomestik.

## 8. Wording Qe Mbetet I Bllokuar

Ky wording mbetet i bllokuar pervec nese zevendesohet nga nje vendim tjeter i
nenshkruar me vone:

- "No win, no fee" nese nenkupton zero kosto te jashtme ne rruge gjyqesore.
- "Pa shpenzime edhe nese rasti humbet."
- "Kompensim i garantuar" ose cdo wording qe garanton pagese.
- "Ne e trajtojme claim-in tuaj" para Agreement Ceremony, handler/SLA memo dhe
  approved scope.
- Cdo wording qe nenkupton se taksat fikse gjyqesore, tarifat per vendim ose
  super-ekspertizat gjithmone absorbohen nga Interdomestik.

## 9. `fees.*` Copy Inventory

| Copy key / surface                                         | Drejtimi i wording te aprovuar                                                                                                            | Aprovuar?                |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| `fees.lossPromise` / `FeeMathSheet`                        | Nese nuk ka rikuperim, nuk ka success fee per Interdomestik; kostot e jashtme te rruges gjyqesore kontrollohen nga marreveshja me shkrim. | yes, under this addendum |
| `fees.courtPathCosts` / Agreement Ceremony                 | Kostot e rruges gjyqesore duhet te shpalosen me shkrim para se rasti te hyje ne gjykate.                                                  | yes, under this addendum |
| `fees.thirdPartyCosts` / `ProposalCard`                    | Taksat fikse gjyqesore, tarifat per vendim dhe super-ekspertizat mund te mbeten pergjegjesi e klientit nese dakordohen me shkrim.         | yes, under this addendum |
| `fees.reimbursement` / Agreement Ceremony and ProposalCard | Rimbursimi i kostove qe Interdomestik i ka paguar paraprakisht i kthehet Interdomestikut kur njihet nga vendimi gjyqesor.                 | yes, under this addendum |

## 10. Attachments / Stop Condition / Approval Appendix

Attachments, stop condition, and Gazmend approval fields are recorded in
`docs/plans/2026-07-08-memo1-finance-cap-evidence-addendum-appendix.md`.
