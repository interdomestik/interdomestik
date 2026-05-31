---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-05-31
adopted_as_canonical: 2026-05-31
program_path: docs/plans/architecture-finalization-program-2026-05-29.md
tracker_path: docs/plans/architecture-finalization-tracker-2026-05-29.md
---

# Përgjigje ndaj `services_technical_alignment.md`

> Status: Supporting architecture input for the adopted architecture-finalization program. The `current-*` documents remain the formal source of truth under planning governance.

## Inputet, kufijtë dhe vendimi teknik për zbatimin e 10 shërbimeve të Interdomestik IDA

**Qëllimi i dokumentit:** Ky dokument i përgjigjet kërkesës për të sqaruar se cilat inpute duhet t'i jepen ekipit të zhvillimit dhe si duhet të rreshtohen 10 shërbimet historike të Interdomestik Asistenca, plus shërbimi shtesë për vonesat e fluturimeve, me arkitekturën e re të platformës IDA.

Dokumenti mund t'i dorëzohet Arben Lilës si udhëzim biznesor, teknik dhe juridik për fazën `ASSIST-00` dhe përgatitjen e `domain-assistance`.

---

## 1. Vendimi kryesor

Formulimi i 10 shërbimeve është i përshtatshëm dhe mund të përdoret si bazë për platformën. Megjithatë, shërbimet nuk duhet të implementohen si një listë statike në UI. Ato duhet të kthehen në **module funksionale** të ndara qartë sipas nivelit të përgjegjësisë:

1. **Free / Self-service** - orientim automatik, checklist, dokumente që mungojnë, hapi i radhës.
2. **Member Assistance** - dosje e ruajtur, status, timeline, dokumente, IDA Card, njoftime, qasje te ekipi.
3. **Professional Recovery** - ndërmjetësim/përfaqësim aktiv vetëm me autorizim, marrëveshje shërbimi, POA ose cedim, dhe success fee të pranuar.

Vendimi im është: **po, të niset `ASSIST-00` menjëherë si program spec; implementimi runtime i madh të lidhet me përfundimin e CRM gate dhe me modelin e ri `domain-case` / `domain-recovery` / `domain-events`.**

---

## 2. Parimet që nuk duhet të shkelen

Interdomestik nuk është kompani sigurimi, nuk është broker dhe nuk garanton kompensim. IDA nuk duhet të krijojë përshtypjen se merr vendime përfundimtare juridike, mjekësore ose financiare.

Çdo modul duhet të ketë gjuhë të kujdesshme:

- “orientim fillestar”;
- “kontroll paraprak”;
- “udhëzim procedural”;
- “dokumentet që mungojnë”;
- “hapi i radhës”;
- “review profesional kur kërkohet”.

Nuk lejohet copy si:

- “kompensim i garantuar”;
- “ne e fitojmë rastin”;
- “ky është vlerësim final”;
- “kalkulator përfundimtar mjekësor/juridik”.

---

## 3. Rreshtimi me arkitekturën e re

Arkitektura e rekomanduar duhet të ndajë qartë funksionet:

- `domain-assistance` - motor rules-first për ndihmë, pre-check, country packs dhe service packs.
- `domain-case` - dosje, raportim, dokumente, status, timeline, member/staff view.
- `domain-recovery` - autorizime, marrëveshje, ndërmjetësim, negocim, gjykatë, fee.
- `domain-events` - evente të auditueshme me payload të redaktuar për timeline, replay dhe audit.
- `domain-billing` - membership, Paddle, legal entity, success fee, invoice, ledger.
- `domain-ai` - extraction vetëm për dokumente, pa vendim final.

`domain-assistance` duhet të prodhojë output të tipit `AssistanceOutcome`, ndërsa workflow layer vendos nëse krijohet case, CRM handoff, staff review ose recovery activation.

---

## 4. Tabela përmbledhëse e inputeve

| Nr. | Shërbimi               | Domain kryesor                                           | Input që duhet dhënë                                               | Kufiri i implementimit                                      |
| --: | ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- |
|   1 | Baza juridike          | `domain-assistance/legal-basis` + `domain-case`          | Rule Matrix sipas shtetit, klasës së sigurimit dhe llojit të dëmit | Orientim, jo opinion final juridik                          |
|   2 | Procedura              | `domain-assistance/procedure` + `domain-case`            | Procedure packs JSON: hapat, dokumentet, afatet, formularët        | Hapat proceduralë, jo përfaqësim                            |
|   3 | Lëndimet               | `domain-assistance/injury` + `domain-case`               | Kriteret jashtëgjyqësore, medical consent, dokumente mjekësore     | Pre-check dhe human review kur duhet                        |
|   4 | Dëmi material          | `domain-assistance/vehicle-damage` + `domain-expert`     | Damage checklist, valuation delta, raport alternativ               | Kontroll paraprak/alternativ, jo ekspertizë finale pa njeri |
|   5 | Invaliditeti           | `domain-expert` + `domain-recovery`                      | Tabelat e invaliditetit sipas siguruesit/policës                   | Member-only, human-reviewed                                 |
|   6 | Help Now / vendngjarje | `domain-assistance/incident-guide`                       | Country packs, police/EAS rules, emergency checklists              | Prioritet absolut; orientim just-in-time                    |
|   7 | Ekspertiza             | `domain-recovery/expert-network`                         | Lista ekspertësh, licenca, marrëveshje, DPA                        | Aktivizohet me pëlqim/anëtarësi                             |
|   8 | Zbritje anëtari        | `domain-billing` + `domain-recovery`                     | Discount matrix, success fee rules                                 | Llogaritje transparente pas agreement                       |
|   9 | Rruga gjyqësore        | `domain-recovery/legal-escalation`                       | Court invariants, refuzim zyrtar, POA, cost approval               | Vetëm me pëlqim të veçantë                                  |
|  10 | Përfaqësim ligjor      | `domain-recovery/legal-handoff`                          | Marrëveshje me avokatë, secrecy, handoff rules                     | Vetëm me autorizim dhe agreement                            |
|  +1 | Vonesa fluturimi       | `domain-assistance/passenger-rights` + `domain-recovery` | EC261 rules, API, assignment/cedim, POA fallback                   | Default cedim; POA fallback                                 |

---

# 5. Përgjigje për secilin shërbim

## 5.1 Shërbimi 1 - Përcaktimi i bazës juridike për dëmshpërblim

Ky shërbim duhet të implementohet si **Legal Basis Pre-check**, jo si opinion juridik përfundimtar. Qëllimi është t'i tregojë përdoruesit nëse, sipas fakteve dhe dokumenteve fillestare, ekzistojnë elemente që mund të krijojnë bazë për kërkesë dëmshpërblimi.

Inputi që duhet t'i jepet Arbenit është një **Rule Matrix**. Kjo matricë duhet të ndahet sipas shtetit, klasës së sigurimit, llojit të dëmit dhe elementeve minimale: ngjarja, dëmi, përgjegjësia, lidhja shkakësore, polica/mbulimi, afati dhe dokumentet kryesore.

Output i platformës duhet të jetë i kujdesshëm: “ka bazë fillestare”, “mund të ketë bazë por mungojnë dokumente”, “baza duket e dobët”, ose “kërkohet review nga ekipi”. Nuk duhet të shfaqet si vendim final.

**Input minimal për ASSIST-00:**

```json
{
  "country": "MK",
  "insurance_class": "TPL",
  "damage_type": "vehicle_material_damage",
  "required_elements": ["incident", "damage", "liable_party", "valid_insurance", "causation"],
  "required_documents": [
    "EAS_or_police_report",
    "photos",
    "vehicle_registration",
    "insurance_policy"
  ],
  "hard_stops": ["injury", "immovable_vehicle", "unclear_liability"],
  "output_level": "orientation_only"
}
```

---

## 5.2 Shërbimi 2 - Udhëzuesi procedural për realizimin e dëmshpërblimit

Ky shërbim duhet të implementohet si **Procedure Pack Generator**. Ai nuk pyet vetëm nëse ka bazë, por i tregon përdoruesit çfarë hapi duhet të ndërmarrë, ku dorëzohet kërkesa, cilat dokumente kërkohen dhe çfarë ndodh nëse siguruesi vonon/refuzon.

Inputi që duhet dhënë është një **Procedure JSON Pack** për MK, KS dhe AL, më vonë për shtetet e tjera. Çdo pack duhet të përmbajë shtetin, klasën e sigurimit, kompaninë/insurer kur është e aplikueshme, llojin e dëmit, fazën e rastit dhe hapat proceduralë.

Ky shërbim duhet të qëndrojë në zonën free/member si udhëzues, por nuk duhet të kalojë në komunikim me siguruesin pa autorizim dhe agreement.

**Input minimal për ASSIST-00:**

```json
{
  "country": "MK",
  "claim_type": "TPL_vehicle_damage",
  "phase": "before_submission",
  "steps": [
    "collect_photos",
    "prepare_EAS_or_police_report",
    "submit_claim_to_responsible_insurer",
    "request_case_number",
    "keep_submission_proof"
  ],
  "mandatory_documents": [
    "claim_form",
    "EAS_or_police_report",
    "photos",
    "registration",
    "bank_account"
  ],
  "recommended_documents": ["repair_estimate", "witness_statement"],
  "escalation_trigger": ["official_rejection", "low_offer", "no_response"]
}
```

---

## 5.3 Shërbimi 3 - Kategorizimi i lëndimeve nga aksidenti

Ky shërbim lidhet me dokumente mjekësore, prandaj nuk mund të trajtohet si free instant decision. Në platformë duhet të jetë **Injury Category Pre-check**, me pëlqim eksplicit për përpunimin e dokumenteve mjekësore.

Inputi i nevojshëm është kombinimi i kritereve jashtëgjyqësore për vlerësim të lëndimeve, lista e dokumenteve të nevojshme dhe teksti i saktë i pëlqimit për medical data. AI mund të ndihmojë në nxjerrjen e të dhënave nga dokumentet, por nuk duhet të japë diagnozë apo vlerësim final.

Output-i i lejuar është: dokumentet janë të mjaftueshme / mungojnë dokumente / kërkohet review nga mjeku censor / kategori orientuese. Për rastet serioze, të ndjeshme ose të paqarta, duhet hard-stop dhe human review.

**Input minimal:**

```json
{
  "country": "MK",
  "injury_context": "traffic_accident_out_of_court",
  "required_medical_documents": ["first_medical_report", "specialist_report", "therapy_report"],
  "sensitive_data_consent_required": true,
  "hard_stops": ["death", "serious_permanent_disability", "minor", "conflicting_medical_records"],
  "output": "orientation_only"
}
```

---

## 5.4 Shërbimi 4 - Vlerësimi paraprak dhe kontrolli alternativ i dëmit material

Ky shërbim duhet të ndahet në tre nënfaza: para vlerësimit të siguruesit, pas procesverbalit/ekspertizës, dhe pas ofertës në para. Prandaj nuk duhet të quhet vetëm “përllogaritje alternative”. Emri më i saktë është: **Vlerësim paraprak dhe kontroll alternativ i dëmit material**.

Inputi që duhet t'i jepet Arbenit është struktura e raportit alternativ: çfarë kontrollohet në ekspertizën e siguruesit, çfarë krahasohet me preventivin/faturën, si identifikohen pjesët e munguara, orët e punës, ngjyrosja, materiali, amortizimi, total loss dhe dëmet e fshehura.

Në free/member mode, sistemi duhet të japë kontroll orientues dhe checklist. Përllogaritja profesionale alternative duhet të bëhet vetëm me human/expert review.

**Input minimal:**

```json
{
  "vehicle_damage_phase": "before_insurer_assessment | after_expertise | after_offer",
  "documents": ["photos", "insurer_expertise", "insurer_offer", "repair_estimate", "invoice"],
  "comparison_fields": [
    "parts",
    "labor_hours",
    "paint",
    "materials",
    "vat",
    "depreciation",
    "hidden_damage"
  ],
  "risk_flags": [
    "offer_lower_than_estimate",
    "missing_paint",
    "wheel_damage",
    "structural_damage",
    "total_loss_possible"
  ],
  "human_review_required_when": ["total_loss", "airbag", "structural_damage", "high_value_vehicle"]
}
```

---

## 5.5 Shërbimi 5 - Vlerësimi i koeficientit të invaliditetit

Ky shërbim nuk duhet të jetë free self-service. Ai lidhet me tabela të siguruesve, kushte të policës, dokumente mjekësore dhe shpesh përfundimin e trajtimit. Prandaj duhet të jetë **member-only / human-reviewed**.

Inputi që duhet dhënë janë tabelat e invaliditetit sipas siguruesit, vendit, produktit dhe versionit të policës. Platforma mund të përgatisë dosjen, të nxjerrë diagnozat, të identifikojë pika kandidate të tabelës dhe të tregojë dokumentet që mungojnë, por koeficienti final duhet të përcaktohet nga eksperti/mjeku censor.

Ky modul duhet të ketë hard-stop nëse nuk ka policë, nuk ka tabelë, trajtimi nuk ka përfunduar, ose dokumentet janë të paqarta.

**Input minimal:**

```json
{
  "insurer": "UNIQA",
  "country": "MK",
  "product_type": "personal_accident",
  "table_version": "YYYY-MM-DD",
  "policy_required": true,
  "medical_completion_required": true,
  "ai_allowed_output": ["candidate_table_items", "missing_documents", "needs_human_review"],
  "final_coefficient_by_ai": false
}
```

---

## 5.6 Shërbimi 6 - Help Now / Udhëzuesi nga vendi i ngjarjes

Ky duhet të jetë moduli kryesor i IDA-s. Ai duhet të ndihmojë anëtarin në minutat e para pas aksidentit, kur gabimet procedurale mund të bëhen të pakthyeshme.

Inputi i nevojshëm është **Country Incident Rules Pack** për MK, KS dhe AL. Ky pack duhet të përmbajë rregullat kur mund të përdoret Deklarata Europiane dhe kur duhet polici/dokumentim zyrtar. Duhet të ketë hard-stops për lëndime, automjet të palëvizshëm, dëmtim rrote/drejtimi/frenimi, targa të huaja, mosmarrëveshje, dëme në pronë publike ose skenar të paqartë.

Ky modul duhet të testojë që platforma të mos japë udhëzim për Deklaratë Europiane kur rregulli kërkon polici ose dokumentim zyrtar.

**Input minimal:**

```json
{
  "country": "MK",
  "scenario": "traffic_accident_scene",
  "questions": [
    "injury_present",
    "vehicle_movable",
    "wheel_damage",
    "steering_damage",
    "brake_damage",
    "parties_agree",
    "foreign_plate_present"
  ],
  "hard_stop_when": [
    "injury_present",
    "vehicle_movable=false",
    "wheel_damage",
    "steering_damage",
    "brake_damage",
    "parties_agree=false"
  ],
  "decision_outputs": [
    "EAS_ALLOWED",
    "POLICE_REQUIRED",
    "OFFICIAL_DOCUMENTATION_RECOMMENDED",
    "HUMAN_REVIEW_REQUIRED"
  ],
  "rule_source_required": true,
  "last_reviewed_required": true
}
```

---

## 5.7 Shërbimi 7 - Ekspertiza profesionale për rastin

Ky shërbim hyn në `domain-recovery`, sepse kërkon aktivizim profesional dhe shpesh pëlqim të veçantë të anëtarit. Nuk është thjesht benefit pasiv; është veprim që mund të krijojë kosto dhe përgjegjësi.

Inputi që duhet dhënë është databaza e ekspertëve bashkëpunëtorë: emri, fusha, licenca, shteti, statusi, kushtet e bashkëpunimit, tarifa, mënyra e ruajtjes së konfidencialitetit dhe marrëveshja për shkëmbim të të dhënave.

Platforma duhet të kërkojë approval për çdo ekspertizë që ka kosto ose ndarje dokumentesh sensitive.

**Input minimal:**

```json
{
  "expert_type": "vehicle_damage | medical | traffic_reconstruction | economic | legal_translation",
  "expert_name": "",
  "license_number": "",
  "country": "",
  "data_processing_agreement": true,
  "member_cost_approval_required": true,
  "case_link_required": true
}
```

---

## 5.8 Shërbimi 8 - Zbritje për anëtarët në procedurat e kompensimit

Ky shërbim lidhet me `domain-billing` dhe `domain-recovery`. Duhet të jetë i qartë: zbritja nuk aplikohet te çdo aktivitet automatik, por te trajtimi profesional i dëm-kërkesës kur anëtari kërkon ndërmjetësim/përfaqësim.

Inputi që duhet dhënë është **Discount Rules Matrix**: tarifa standarde, tarifa për anëtar, zbritja, success fee, minimum fee, cap nëse aplikohet, dallimi midis out-of-court dhe court/legal action.

Kjo duhet të shfaqet në platformë para se anëtari të nënshkruajë marrëveshjen e shërbimit.

**Input minimal:**

```json
{
  "service_type": "professional_recovery",
  "standard_success_fee_percent": 20,
  "member_discount_percent": 50,
  "member_effective_fee_percent": 10,
  "legal_action_fee_percent": null,
  "minimum_fee": null,
  "accepted_before_recovery_required": true
}
```

---

## 5.9 Shërbimi 9 - Organizimi i rrugës gjyqësore

Ky shërbim duhet të jetë në `domain-recovery/legal-escalation`. Ai nuk aktivizohet automatikisht. Duhet të ekzistojnë kushte të rrepta para kalimit në gjykatë: refuzim zyrtar, mungesë përgjigjeje pas afatit, ofertë shumë e ulët, bazë e fortë prove, vlerë e arsyeshme e kontestit dhe miratim i veçantë nga anëtari.

Inputi që duhet dhënë është **Court Invariants Matrix**: kur lejohet shqyrtimi gjyqësor, çfarë dokumentesh kërkohen, kush e aprovon, cilat kosto mund të krijohen dhe cili avokat/partner aktivizohet.

Platforma duhet të ruajë audit trail të plotë për vendimin e eskalimit.

**Input minimal:**

```json
{
  "court_escalation_allowed_when": [
    "official_rejection",
    "no_response_after_deadline",
    "low_offer_with_evidence"
  ],
  "required_documents": [
    "rejection_letter",
    "claim_file",
    "evidence_pack",
    "member_approval",
    "poa"
  ],
  "cost_approval_required": true,
  "lawyer_handoff_required": true,
  "audit_event_required": true
}
```

---

## 5.10 Shërbimi 10 - Mbështetje për përfaqësim ligjor

Ky shërbim është fazë e avancuar e `domain-recovery`. Ai kërkon autorizim, marrëveshje të veçantë, ruajtje të sekretit profesional dhe kontroll të qartë të qasjes në dokumente.

Inputi që duhet dhënë është marrëveshja me avokatët partnerë: scope i punës, shteti, lloji i rasteve që marrin, fee arrangement, konfidencialiteti, raportimi, përgjegjësia, ruajtja e të dhënave dhe handoff rules.

Ky shërbim nuk duhet të shfaqet si “aktivizo menjëherë”; duhet të shfaqet si proces profesional që fillon vetëm kur janë plotësuar kushtet.

**Input minimal:**

```json
{
  "lawyer_partner": "",
  "country": "",
  "case_types": ["TPL", "flight_delay", "property", "injury"],
  "confidentiality_agreement": true,
  "poa_required": true,
  "member_approval_required": true,
  "document_access_scope": "case_specific_only"
}
```

---

## 5.11 Shërbimi shtesë - Vonesa dhe anulime të fluturimeve

Ky shërbim duhet të jetë nën-domain i veçantë: `domain-assistance/passenger-rights` ose `domain-assistance/flight-delay`. Nuk duhet të jetë vetëm një kartë UI. Ai kërkon EC261 rule engine, flight data API, document intake, assignment/cedim, POA fallback, airline submission dhe compensation ledger.

Modeli juridik i rekomanduar është: **default cedim/assignment i kërkesës**, me **POA fallback** kur cedimi nuk pranohet ose nuk është i përshtatshëm. Kjo i jep Interdomestik-ut kontroll më të mirë mbi pagesën dhe success fee.

Inputi që duhet dhënë është: API i fluturimeve, rregullat EC261 të versionuara, template i cedimit, POA fallback, success fee terms dhe airline contact registry.

**Input minimal:**

```json
{
  "flight_rule_set": "EC261",
  "flight_api_provider": "FlightAware | AviationStack | other",
  "legal_model_default": "assignment",
  "legal_model_fallback": "poa",
  "required_documents": ["boarding_pass", "ticket", "pnr", "airline_email"],
  "compensation_amounts": [250, 400, 600],
  "airline_submission_allowed_only_after": [
    "assignment_signed_or_poa_signed",
    "success_fee_accepted",
    "privacy_consent"
  ]
}
```

---

# 6. Kërkesat ndër-funksionale që vlejnë për të gjitha shërbimet

## 6.1 Disclaimer model

Çdo modul duhet të ketë disclaimer të integruar në output. Shembull:

> Ky rezultat është orientim fillestar nga IDA dhe nuk zëvendëson shqyrtimin profesional juridik, mjekësor, ekspertizën ose vendimin e organit kompetent.

Ky tekst duhet të jetë i versionuar dhe i kontrolluar me brand/legal lint.

## 6.2 PII dhe dokumente sensitive

Platforma duhet të ketë:

- `consent_events`;
- `document_classification`;
- `purpose_limited_processing`;
- `document_access_logs`;
- `medical_data_explicit_consent`;
- `ai_processing_audit_log`;
- `retention_policy_by_document_type`.

Dokumentet mjekësore dhe dokumentet për përfaqësim ligjor nuk duhet të jenë të dukshme për agjentë/promotorë.

## 6.3 Domain events

Çdo hap kritik duhet të krijojë event:

- assistance_pack_generated;
- case_opened;
- document_uploaded;
- medical_consent_accepted;
- recovery_requested;
- poa_signed;
- assignment_signed;
- fee_agreement_accepted;
- expert_cost_approved;
- legal_escalation_started;
- compensation_received.

Payload duhet të jetë i redaktuar, pa të dhëna sensitive të plota.

## 6.4 Brand/legal lint

Duhet të ketë CI kontroll që bllokon copy të rrezikshme:

- “garantojmë kompensim”;
- “fitoni patjetër”;
- “vlerësim final”;
- “kalkulator invaliditeti final”;
- “ne jemi sigurimi juaj”.

Gjithashtu duhet të kontrollojë që mesazhi final mbrojtës të mos hiqet nga faqet kyçe.

---

# 7. Përgjigje direkte për ekipin teknik

## A jemi dakord me ndarjen e inputeve?

Po, jemi dakord me ndarjen në parim, me këto korrigjime:

1. Shërbimet 1-6 janë `domain-assistance` + `domain-case`, jo vetëm `domain-case`.
2. Shërbimi 5 nuk duhet të jetë free; është member/human-reviewed.
3. Shërbimet 7-10 janë `domain-recovery`, jo vetëm billing/claims.
4. Vonesa duhet të ketë nën-domain të veçantë `flight-delay/passenger-rights`.
5. Billing/Paddle duhet të lidhet me `legal_tenant_id`, jo vetëm tenant/host.
6. Çdo output duhet të jetë rules-first dhe i auditueshëm.

## A mund të fillojë puna menjëherë?

Po, por vetëm për `ASSIST-00` dhe përgatitjen e kontratave/domain contracts. Runtime implementation duhet të nisë pasi të mbyllen:

- disclaimer model;
- PII/medical consent model;
- authorization/POA/assignment model;
- confidence threshold policy;
- legal/entity billing separation.

## A i japim dritën e gjelbër T-011, T-108, T-114?

Drita e gjelbër jepet vetëm për **Design Gate / Spec Gate**, jo për implementim të plotë pa këto dokumente bazë. Çdo ticket duhet të ketë acceptance criteria të qarta, i18n, audit logs dhe no-guarantee copy.

---

# 8. Paketat konkrete që duhet t'i dorëzohen Arbenit

## Paketa A - Rule Matrix

Për MK, KS, AL:

- TPL;
- Kasko;
- Green Card;
- property;
- health/accident;
- flight delay;
- injury;
- vehicle damage;
- invalidity.

## Paketa B - Procedure Packs

Për secilin shtet:

- dokumente të detyrueshme;
- dokumente të rekomanduara;
- afate orientuese;
- ku dorëzohet kërkesa;
- çfarë ndodh kur ka refuzim;
- kur kalon në recovery.

## Paketa C - Legal Documents

- Terms of Assistance;
- Professional Recovery Agreement;
- POA;
- Assignment/Cedim për Vonesa;
- Success Fee Agreement;
- Medical Data Consent;
- Expert Cost Approval;
- Lawyer Handoff Consent.

## Paketa D - UI Copy

- SQ/MK/EN microcopy;
- disclaimers;
- service cards;
- dashboard states;
- next-step messages;
- error states;
- consent texts.

## Paketa E - Governance

- brand/legal lint;
- rule versioning;
- source/date/owner për çdo country pack;
- audit event list;
- retention policy;
- data access roles.

---

# 9. Prioritetet e zbatimit

## Prioritet 1 - Help Now / Police vs EAS Guide

Ky është funksioni më i rëndësishëm lokal. Duhet të implementohet i pari për MK/KS/AL, sidomos për rastet kur qytetarët gabimisht përdorin Deklaratën Europiane në vend të policisë/dokumentimit zyrtar.

## Prioritet 2 - Legal Basis + Procedure Guide

Këto dy module krijojnë bërthamën e self-service. Ato ndihmojnë përdoruesin të kuptojë nëse ka bazë dhe çfarë duhet të bëjë.

## Prioritet 3 - Vehicle Damage + Injury Pre-check

Këto krijojnë vlerë të lartë për anëtarët, por kërkojnë kujdes me disclaimers dhe human review.

## Prioritet 4 - Vonesa / Flight Delay

Ky shërbim ka potencial shumë të mirë marketingu dhe revenue, por kërkon assignment/POA, EC261 rules dhe compensation ledger.

## Prioritet 5 - Professional Recovery 7-10

Ky është më kompleks juridikisht dhe financiarisht, prandaj duhet të vijë pasi të jenë stabilizuar authorization, agreements, fee rules dhe audit trail.

---

# 10. Përfundimi

Ky dokument konfirmon që formulimi i 10 shërbimeve është i përshtatshëm për Interdomestik, por zbatimi duhet të jetë i kontrolluar dhe domain-driven.

**Vendimi final:**

- Miratohet `ASSIST-00` si fazë specifikimi.
- Miratohet ndarja në `domain-assistance`, `domain-case`, `domain-recovery`, `domain-events`, `domain-billing`, `domain-ai`.
- Nuk miratohet implementim i plotë pa disclaimer model, PII model, authorization/assignment model dhe confidence threshold policy.
- Shërbimet 7-10 implementohen vetëm si Professional Recovery Mode me autorizim dhe marrëveshje.
- Vonesa implementohet si nën-domain i veçantë me cedim si default dhe POA si fallback.

**Mesazhi që duhet të udhëheqë gjithë platformën:**

> Interdomestik IDA nuk garanton kompensim dhe nuk zëvendëson siguruesin, avokatin ose ekspertin. IDA ndihmon anëtarin të kuptojë situatën, të dokumentojë rastin, të ndjekë procedurën dhe, kur jep autorizim, të aktivizojë mbështetje profesionale për realizimin e të drejtave të tij.
