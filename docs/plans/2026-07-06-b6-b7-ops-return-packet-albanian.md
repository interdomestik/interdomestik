---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-07-06
related:
  - docs/plans/2026-07-06-b6-b7-help-now-exercise-worksheet.md
  - docs/plans/2026-07-06-ent-a05-content-pack-hotfix-exercise-intake.md
  - docs/plans/2026-07-06-ent-a06-alert-owner-assignment-and-proof-intake.md
  - docs/plans/2026-07-06-ent-a06-help-now-alert-preflight.md
  - docs/manual/runbook-content-pack-hotfix.md
  - docs/reviews/2026-07-06-nine-step-goal-status-and-next-actions.md
  - docs/reviews/2026-07-06-nine-step-evidence-intake-register.md
---

# Paketa e Kthimit per B6/B7 - Help Now Ops

> Status: udhezim operativ dhe paketim evidence. Kjo pakete nuk e mbyll B6,
> nuk e mbyll B7, nuk ndryshon runtime, nuk aktivizon MK, nuk ndryshon
> provider alerts, dhe nuk autorizon `MOB-01b`.

## Pse na duhet kjo

Para se Help Now te kaloje nga gjendja `dark` ne publik per MK, platforma duhet
te provoj dy gjera praktike:

- **B6 / ENT-A05:** nese nje numer emergjent, rregull policor, sigurim, ose
  tekst rrugor del gabim, ekipi di ta ktheje pack-un ne gjendje te mbyllur,
  ta korrigjoje ne staging, ta verifikoje cache/service-worker, dhe ta riktheje
  prape ne gjendje te sigurt.
- **B7 / ENT-A06:** nese Help Now prishet ose nuk funksionon si duhet, ekziston
  alarm real qe shkon te nje pronar i emeruar dhe ai alarm mund te pranohet pa
  ekspozuar sekrete, PII, kanale private, ose te dhena te klientit.

Pa keto prova, Interdomestik mund te kete permbajtje te sakte ne dokument, por
ende te mos kete siguri operacionale qe permbajtja mund te korrigjohet dhe
monitorohet ne menyre serioze.

## Kufiri i autoritetit

Kjo pakete eshte vetem per mbledhje dhe kthim evidence.

Lejohet:

- emerimi i operatorit B6;
- emerimi i pronarit te alarmeve B7;
- prova ne staging;
- inventari i rregullave/monitorimeve te provider-it;
- shenime te sigurta ne repo ose ne qendren e te dhenave/evidences.

Nuk lejohet nga kjo pakete:

- ekspozimi publik i MK;
- ndryshimi i flag/config per non-dark;
- ndryshim ne `apps/web/src/proxy.ts`;
- ndryshim auth, routing, tenancy, schema, RLS, billing, ose runtime code;
- vendosje sekretesh, DSN, token, email, numer telefoni, link privat kanali,
  claim id, document id, payment id, raw request body, ose PII ne repo.

`MOB-01b` mund te kerkohet vetem pasi A04/A05/A06 te jene te mbyllura me
evidence dhe current authority/design gate ta promovoje sakte ate slice.

## Roli i personave

| Roli                  | Cfare ben                                                                  | A mjafton vetem emri?                                     |
| --------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------- |
| Pronari llogaridhenes | Pranon rezultatin final te B6/B7 dhe vendos nese prova eshte e mjaftueshme | Jo, duhet edhe data dhe referenca e evidences             |
| Operatori B6          | Kryen ose kerkon staging deploy dhe provon hotfix/re-darken                | Jo, duhet SHA, URL i run-it, matje kohe dhe rezultat      |
| Pronari i alarmeve B7 | Kontrollon provider-in, rregullat, sinjalet dhe pranimin e alarmit         | Jo, duhet inventar, test notification dhe acknowledgement |
| Shqyrtuesi            | Kontrollon qe prova nuk ka boshlloqe ose te dhena te pasigurta             | Jo, duhet vendim PASS/CORRECT/BLOCK                       |

## Fjalori i vendimeve

Per secilin hap perdor vetem keto vendime:

| Vendimi                 | Kuptimi                                                                                 |
| ----------------------- | --------------------------------------------------------------------------------------- |
| `PASS`                  | Prova eshte e plote dhe e sigurt per kete hap                                           |
| `CORRECT`               | Ka gabim te vogel ose informacion te paplote; duhet korrigjim para pranimit             |
| `BLOCK`                 | Hapi nuk mund te pranohet; ndalon B6/B7 dhe bllokon MOB-01b                             |
| `NEEDS_INSTRUMENTATION` | Provider-i nuk mund ta shoh sinjalin; duhet slice i ri i autorizuar per instrumentation |

## B6 - Cfare duhet te ktheje operatori

**Pyetja qe po e mbyllim:** a mund ta korrigjojme dhe ta mbyllim shpejt nje
Help Now content pack nese del problem?

Ploteso keto fusha:

| Fusha                          | Pse na duhet                                                      | Pergjigja |
| ------------------------------ | ----------------------------------------------------------------- | --------- |
| Emri i operatorit B6           | Platforma duhet te dije kush e kreu proven                        |           |
| Roli / ekipi                   | Tregon a ka kompetence per staging/deploy/cache                   |           |
| Data e ushtrimit               | Na duhet evidence e dateruar, jo kujtim verbal                    |           |
| Environment                    | Duhet te jete staging, jo production                              |           |
| Staging deployment SHA         | Lidh proven me version konkret te platformes                      |           |
| CD/deploy run URL              | Prova duhet te jete e verifikueshme                               |           |
| Country / pack                 | Tregon cilin pack po testojme                                     |           |
| Version/hash para ndryshimit   | Na duhet per ta lidhur pack-un me permbajtjen para testit         |           |
| Version/hash pas ndryshimit    | Na duhet per te verifikuar qe browser/cache e mori versionin e ri |           |
| Route e testuar                | Tregon ku u kontrollua Help Now                                   |           |
| Koha kur deploy perfundoi      | Matja e propagimit fillon ketu                                    |           |
| Koha kur permbajtja e re u pa  | Tregon sa shpejt arrin korrigjimi te perdoruesi                   |           |
| Koha kur stale cache u pastrua | Prova kryesore per service-worker/cache                           |           |
| Koha kur re-darken u pa        | Prova qe mund ta mbyllim pack-un prape                            |           |

Pastaj vendos rezultat per secilen prove:

| Prova B6               | Cfare duhet te provohet                              | Vendimi | Evidence |
| ---------------------- | ---------------------------------------------------- | ------- | -------- |
| Hotfix record          | Ka trigger, severity, owner dhe hash para ndryshimit |         |          |
| Re-darken              | Route publike kthehet ne gjendje dark/placeholder    |         |          |
| Korrigjim staging-only | Ndryshimi nuk prek production                        |         |          |
| Manifest/hash          | Versioni/hash ndryshon dhe regjistrohet              |         |          |
| Route proof            | Route e Help Now shfaq gjendjen e pritur             |         |          |
| SW/cache revalidation  | Permbajtja e vjeter nuk mbetet e bllokuar            |         |          |
| Cache safety           | Nuk ka member/session/local incident data ne cache   |         |          |
| Rollback/re-darken     | Mund te kthehemi prape ne gjendje te mbyllur         |         |          |

Rezultati final:

```text
B6 result: PASS / CORRECT / BLOCK
Gjetjet bllokuese:
Gjetjet jo-bllokuese:
Pronari i korrigjimit:
Shqyrtuesi:
Data:
Referenca ku ruhet evidence:
```

## B7 - Cfare duhet te ktheje pronari i alarmeve

**Pyetja qe po e mbyllim:** nese Help Now prishet, a e merr dikush alarmin
me kohe dhe pa rrezikuar te dhena sensitive?

Ploteso keto fusha:

| Fusha                             | Pse na duhet                                                     | Pergjigja |
| --------------------------------- | ---------------------------------------------------------------- | --------- |
| Emri i pronarit B7                | Platforma duhet te dije kush mban pergjegjesi per alert coverage |           |
| Roli / ekipi                      | Tregon a ka qasje dhe kompetence per provider-in                 |           |
| Provider / project slug           | Lidh proven me sistemin real te monitorimit                      |           |
| Environment                       | Duhet te jete staging ose provider-supported safe test           |           |
| Public route e kontrolluar        | Tregon cilin surface mbulon alarmi                               |           |
| Staging deployment SHA            | Lidh proven me version konkret                                   |           |
| Menyra e testit sintetik          | Tregon si u ndez alarmi pa production traffic                    |           |
| Koha e trigger-it                 | Mat kur filloi sinjali                                           |           |
| Koha kur provider-i e pa event-in | Tregon observability                                             |           |
| Koha kur njoftimi u pranua        | Tregon se alarmi arrin te personi/kanali                         |           |
| Kush e pranoi alarmin             | Tregon acknowledgement, pa vendosur kanal privat ne repo         |           |

Pastaj vendos rezultat per secilin failure mode:

| Failure mode B7                | Cfare duhet te provohet                                              | Vendimi | Evidence e sigurt |
| ------------------------------ | -------------------------------------------------------------------- | ------- | ----------------- |
| Public route error             | Ekziston rule/monitor per error te Help Now route/server             |         |                   |
| Pack manifest failure          | Provider ose substitute i sigurt e kap manifest-in qe mungon/gabohet |         |                   |
| Service-worker failure         | Ka monitor, browser proof, ose blocker te qarte                      |         |                   |
| Cache-save/cache-guard failure | Ka alert, release-check substitute, ose blocker te qarte             |         |                   |
| Anonymous funnel failure       | PostHog/provider dashboard/alert ose substitute i sigurt             |         |                   |
| Dark-state drift               | Alert, release check, ose blocker i lidhur me sign-off               |         |                   |

Rezultati final:

```text
B7 result: PASS / CORRECT / BLOCK / NEEDS_INSTRUMENTATION
Gjetjet bllokuese:
Gjetjet jo-bllokuese:
Pronari i korrigjimit:
Shqyrtuesi:
Data:
Referenca ku ruhet evidence:
```

## Cfare e bllokon menjehere

B6 nuk pranohet nese:

- nuk ka operator te emeruar;
- staging SHA mungon;
- URL/run proof mungon;
- ka vetem screenshot pa URL/SHA;
- nuk provohet re-darken;
- nuk provohet cache/service-worker revalidation;
- cache proof perfshin te dhena te perdoruesit ose member/session data.

B7 nuk pranohet nese:

- nuk ka pronar alarme;
- provider/project slug mungon;
- nuk ka routed notification dhe acknowledgement;
- route-error coverage perdoret si prove e vetme;
- SW/cache/manifest/funnel/dark-state nuk jane te provuara ose te bllokuara
  qarte;
- evidence perfshin sekrete, PII, emails, numra telefoni, raw URLs, private
  channel links, claim/document/payment identifiers, ose high-cardinality data.

## Si kthehet paketa

Kthimi minimal i pranueshem:

1. B6 table e plotesuar ose `BLOCK` me arsye konkrete.
2. B7 table e plotesuar ose `BLOCK` / `NEEDS_INSTRUMENTATION` me arsye konkrete.
3. Data, emri i personit, roli, dhe referenca e evidences.
4. Konfirmim qe evidence e ndjeshme ruhet jashte repo-s ne qendren e te
   dhenave/evidences, kur nuk guxon te futet ne repo.

Nese ka korrigjim pas nje muaji, mos e mbishkruaj rekordin e vjeter. Hape nje
rekord te ri me date te re, sheno se cilin rekord e zevendeson, dhe lidhe
versionin/hash-in e ri me proven e re. Kjo e mban historine auditueshme.
Indeksoje edhe ne
`docs/reviews/2026-07-06-nine-step-evidence-intake-register.md`.

## Acceptance nga Interdomestik

Arben/Codex mund ta pranoje paketen vetem kur:

- B6 ka `PASS`, ose ka `BLOCK` qe e ndalon qarte MOB-01b;
- B7 ka `PASS`, ose ka `BLOCK` / `NEEDS_INSTRUMENTATION` qe krijon kandidatin
  e ri per current authority;
- nuk ka sekrete/PII ne repo;
- te gjitha datat, emrat, SHA/URLs dhe evidence references jane te plotesuara;
- rezultati eshte cituar prapa ne worksheet/intake perkatese.

Pranim i kesaj pakete nuk do te thote launch. Do te thote vetem qe B6/B7 jane
dispozicionuar me evidence dhe mund te citohen ne vendimin e radhes.
