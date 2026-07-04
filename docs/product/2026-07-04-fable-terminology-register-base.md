---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-04
related:
  - docs/product/2026-07-03-mobile-copy-system.md
  - docs/product/2026-07-03-ks-help-now-content-dossier-draft.md
  - docs/product/2026-07-03-artifact-pdf-template-specs.md
  - docs/product/2026-07-03-screen-reader-flow-scripts.md
---

# Fable Terminology And Register Base

> Status: **Fable 5 advisory input only - no implementation authority.** This is
> a draft termbase for reviewer correction, not a linguistic or legal source of
> truth. All sq/de/mk terms are `[NATIVE]` until signed by qualified reviewers.
> Jurisdictional or legal terms are `[UNVERIFIED]` until L2/L5 review.

## Foundations

| Locale | Register rule                                                                                 |
| ------ | --------------------------------------------------------------------------------------------- |
| sq     | Use formal `ju`. Written artifacts use standard Albanian with Kosovo-transparent vocabulary.  |
| de     | Use formal `Sie`. Sound like competent consumer-protection language, not translated legalese. |
| en     | Pivot/reference locale; do not let English idioms drive legal meaning.                        |
| mk     | Cyrillic-only placeholder policy; public mk content remains dark until native legal review.   |

Locale follows the user, not the incident country. A `de` user reading a Kosovo
pack gets German chrome plus country-specific bilingual content.

## Term Families

| Concept        | en                             | sq draft                                         | de draft                                             | Flags                  |
| -------------- | ------------------------------ | ------------------------------------------------ | ---------------------------------------------------- | ---------------------- |
| recover        | recover                        | `kthej` / document: `rikuperim`                  | `zurueckholen` / document: `Durchsetzung`            | `[NATIVE]`             |
| success fee    | success fee                    | `tarifa e suksesit`                              | `Erfolgshonorar`                                     | `[L5][UNVERIFIED]`     |
| no win, no fee | recover nothing -> pay nothing | `Nese nuk kthejme asgje, ju nuk paguani asgje.`  | `Holen wir nichts zurueck, zahlen Sie nichts.`       | `[L5]`                 |
| membership     | membership                     | `anetaresia`                                     | `Mitgliedschaft`                                     | never insurance policy |
| annual fee     | annual fee                     | `anetaresia vjetore`                             | `Jahresbeitrag`                                      | never premium          |
| case           | your case                      | `rasti juaj`                                     | `Ihr Fall`                                           | never `Prozess`        |
| claim          | claim                          | `kerkesa` / document: `kerkesa per demshperblim` | `Forderung` / document: `Schadenersatzanspruch`      | `[NATIVE]`             |
| insurer        | insurer                        | `sigurimi` / document: `siguruesi`               | `Versicherung` / document: `Versicherer`             | we are never this      |
| police report  | police report                  | `raporti i policise`                             | `Polizeibericht`                                     | `[L2]`                 |
| EAS            | European Accident Statement    | `Raporti Evropian i Aksidentit`                  | `Europaeischer Unfallbericht`                        | `[L2][UNVERIFIED]`     |
| Green Card     | Green Card                     | `Kartoni i Gjelber`                              | `Gruene Karte`                                       | `[L2][UNVERIFIED]`     |
| evidence       | evidence                       | `provat`                                         | member: `Fotos und Belege`; document: `Beweismittel` | tiered                 |
| vehicle        | vehicle/car                    | member: `vetura`; document: `automjeti`          | member: `Auto`; document: `Fahrzeug`                 | `[NATIVE]`             |
| POA            | power of attorney              | member: `autorizimi`; document: `prokura`        | `Vollmacht`                                          | `[L1][L5]`             |
| consent        | consent                        | `pelqimi`                                        | `Einwilligung`                                       | data context           |
| handler        | handler                        | prefer verb: `Ana ndjek rastin tuaj`             | `Ansprechpartner/in`                                 | `[UPL]`                |

Note: accented spellings above are draft-normalized to ASCII for this input
file. Native review owns final diacritics and orthography; shipped sq strings
must keep correct diacritics.

## Surface Registers

| Surface                        | Register                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Help Now                       | Triage nurse: verb first, one instruction per sentence, no sales language.     |
| Claim Pack / EAS / Signed Pack | Filing-grade document: precise, printable, grayscale-safe, no chat tone.       |
| SMS / WhatsApp                 | One calm line; no marketing add-on; artifact reference included when useful.   |
| Legal agreement                | Document register; summaries use member terms with one legal bridge.           |
| Branch script                  | Capable relative: warm speech, fixed nouns, no improvising fee or legal lines. |

## Forbidden Terms

- Do not call membership a policy, premium, insurance, `polica`, `Police`, or
  `Praemie`.
- Do not call non-lawyer staff `lawyer`, `avokat`, `Anwalt`, or imply legal
  representation before licensing is confirmed.
- Do not use outcome guarantees except the reviewed fee-promise sentence after
  the expert-cost decision is resolved.
- Do not use legalese on emergency screens: `pursuant to`, `gemäß`,
  `diesbezueglich`, `parashtroni`, or bare statutory citations.
- Do not use `Prozess` for a case in German; it implies a lawsuit/trial.
- Do not strip sq or mk diacritics in shipped strings; this ASCII draft is not a
  localization payload.

## False-Friend Risks

1. German `Prozess` and Albanian `proces` can imply court process, not a case.
2. `eventuell` / `eventualisht` means possibly, not eventually.
3. `kontrollieren` / `kontrolloj` means inspect/check, not control or decide.
4. Albanian `pretendim` can sound like pretending on member surfaces; prefer
   `kerkesa` unless document register requires otherwise.
5. German `erholen` means recover health; never use it for money recovery.
6. German `Provision` means commission, not a contract provision.
7. Albanian `sigurim` can mean insurance or security; context must disambiguate.

## QA Checklist

- Every launch locale has complete full-sentence keys; no fragments assembled in
  code.
- Forbidden-term scan passes per locale.
- Surface register matches namespace and artifact type.
- `@legal-reviewed` keys have review references before public exposure.
- Stress strings fit after translation, not only in English.
- Screen-reader scripts are read aloud per locale before gate closure.
- SMS budget accounts for sq/mk encoding; never remove diacritics to fit.
- Bilingual EAS field labels follow official semantics, not brand preference.

## Reviewer Questions

1. Does formal `ju` feel natural for Kosovo emergency copy?
2. Should KS member surfaces use `vetura`, `makina`, or another vehicle term?
3. What is the accepted sq name for the EAS in insurer practice?
4. What is the official and colloquial Green Card terminology?
5. Is `tarifa e suksesit` acceptable in KS consumer contracts?
6. Does KS POA practice require `prokura`, `autorizim`, or a notarized term?
7. Does German `Erfolgshonorar` or `Rechtsdienstleistung` trigger regulated
   framing for diaspora surfaces?
8. Is there a safe sq noun for handler, or should the verb form remain the rule?
9. Who owns mk legal-language review before MK country content leaves dark mode?
10. Do target iOS/Android builds have acceptable sq/mk screen-reader voices?
