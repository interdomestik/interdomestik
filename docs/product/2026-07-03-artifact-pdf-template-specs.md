---
plan_role: input
status: draft
source_of_truth: false
owner: product-design
last_reviewed: 2026-07-03
related:
  - docs/product/2026-07-03-mobile-design-review-enterprise.md
  - docs/product/2026-07-03-mobile-visual-benchmark-moodboard-brief.md
  - docs/product/2026-07-03-mobile-copy-system.md
---

# PDF / Artifact Template Specs (Claim Pack · Bilingual EAS · Signed Pack)

> Status: **Design specification — no implementation authority.** Templates for the three document artifacts. The Claim Pack and EAS specs are MOB-DG01-consumable; the Signed Pack is a placeholder finalized at MOB-DG05. These documents are the product's credibility in physical form: they must survive being printed, faxed to an insurer, and handed to a lawyer.

## 0. Shared Foundations (all artifacts)

**Page.** A4 portrait, margins 22mm outer / 18mm inner, single column. Footer on every page. Never letter-size; never mobile-shaped pages exported as PDF.

**Typography.** Same family as the app (Inter-class) — brand continuity — but at document scale: 10.5pt body / 1.4; 13pt section heads SemiBold; 9pt footer/metadata; tabular numerals for all figures, dates, references. No color dependence: the document must read perfectly in grayscale photocopy. Ink-navy prints as near-black; amber never appears in documents.

**Header band (page 1 only).** Left: Interdomestik wordmark (mono-ink version) + legal entity line (per `T-407`: contracting entity, registration no., city). Right: document type in caps ("CLAIM PACK") + reference number. A 0.5pt rule below. Subsequent pages: slim header — reference number left, document type right.

**Reference number scheme.** `IDA-{type}-{YYYYMMDD}-{shortid}` where type ∈ {CP, EAS, SP} and shortid is a 6-char content-hash-derived code (locally generated for free artifacts — no server round-trip; the shortid lets support match a pack a member reads over the phone). Printed on every page footer.

**Footer (every page).** Left: reference number + generation timestamp (with timezone). Center: page x of y. Right: the version line — pack content version hash for guidance content (binds to L2 sign-off), template version. 9pt slate.

**Legal marker placement (uniform rule).** Clarity markers (`markers.*` catalog only) appear in exactly two places per artifact: (1) one line on the cover/first page beneath the title — the "starting file" marker; (2) the full marker paragraph in a bordered box on the final page, before the sign-off area. Never per-page repetition (reads as fear), never inline interruptions of content.

**Empty-field rule.** A field without data renders `— not provided —` in slate italics. Blank cells are forbidden — a blank looks like a generation bug; "not provided" looks like an honest record. Sections with zero content collapse to a single line ("No witnesses recorded").

**Generation failure (app-side).** If PDF assembly fails: the artifact card shows a designed error (taxonomy class D, see error-taxonomy doc), all captured content remains intact, retry re-uses the same reference number (idempotent per content hash — two retries must not create two reference identities).

**Filing-grade criteria (the definition of done for any artifact template):**

1. Survives grayscale print and re-scan (no thin tints, no color-coded meaning).
2. Every page self-identifies (reference + page x/y) — pages get separated in real files.
3. Facts and member statements are visually separated from Interdomestik guidance (a lawyer must be able to cite the facts without excerpting our advice).
4. Machine-readable spine: embedded PDF metadata (reference, type, versions) + the shortid — no QR codes on legal documents at launch (scan-culture mismatch; revisit _future, not launch_).
5. A lawyer, insurer clerk, or border policeman can each find their section in <10 seconds via the page-1 contents line.

---

## 1. Claim Pack PDF (`IDA-CP-…`) — MOB-01

**Purpose.** The free artifact that makes IDA credible before any payment. Structure (6–10 pages typical):

**P1 — Cover & summary.**
Header band. Title: "Claim Pack — {incident type}, {date}". Beneath: the one-line starting-file marker. Then the summary block (bordered, the page's substance): incident date/time/place (country flag + name), parties count, vehicle(s), injuries y/n (only if user stated; otherwise omitted — never "no"), evidence items count, generation context ("Prepared from information provided by the member on {date}"). Contents line at bottom: "1 Summary · 2 Facts · 3 Deadlines · 4 Documents · 5 Letter · A Evidence".

**P2 — Facts as provided.**
The member's answers rendered as numbered statements in first person ("1. On 12 March at ~17:40 I was driving…") — first person because this page may become the member's statement draft; a header note says exactly that ("Your account, as you entered it. Correct anything before sharing."). No IDA interpretation on this page (criterion 3).

**P3 — Basis & procedure (guidance page).**
Visually distinct from facts (slate side-rule down the margin, "Guidance" running label). Basis band + reason sentence (as CP-1 on screen) **with the ReviewBadge line in print form**: "Initial assessment — confirmed by Interdomestik's legal team within 1 business day of case handover." Country procedure steps (numbered, from the signed content pack). Deadline statement in range form + the verify line.

**P4 — Document checklist.**
Two-state table (Have ☑ / Needed ☐) with per-document "where to get it" hints from the country pack. This page is designed to be _worked on paper_ — real checkboxes, generous row height.

**P5 — Letter template.**
Pre-filled first-notification letter to the insurer (country pack template + member facts), clearly watermarked `DRAFT` diagonal at 8% tint until the member fills the two bracketed fields ([policy number], [claim number if any]). Address block laid out for windowed envelopes. This is the page that gets used — it earns its own page.

**A — Evidence manifest (annex).**
Table: # / type (photo, document) / capture timestamp / device-local filename / SHA-256 short hash. **No images embedded by default** (privacy: packs get emailed) — the manifest proves existence and integrity; a "+ include photos" export variant embeds them 2-up with captions. Final page carries the full marker box.

**Error/empty states.** No evidence → manifest collapses to one line. No country pack signed → P3 renders the generic-EU variant with its distinct "general guidance" marker; deadline section then shows only the verify line, never a range.

---

## 2. Bilingual EAS Artifact (`IDA-EAS-…`) — MOB-01 / Trip Mode

**Purpose.** The European Accident Statement as a fill-at-the-scene companion — the shareable artifact for the diaspora corridor.

**Format.** A4 landscape (the official EAS is landscape two-column — familiarity beats brand preference here). Two-page artifact:

**P1 — The bilingual form.**
Official EAS field structure and numbering (1–17), each field label rendered as a stacked pair: primary locale bold 9pt / secondary locale regular 8.5pt slate (de+sq or de+mk per corridor). Field numbering and layout mirror the standard EAS so a German driver recognizes it instantly — **do not redesign the form; bilingualize it.** Checkbox field 12 (circumstances) gets the pair treatment per row. Sketch area (field 13) full width. Signature boxes (15) untouched standard.
Print note in footer: "Print two copies — both drivers sign both."

**P2 — How to fill it together (guidance).**
Side-by-side two-language columns (not stacked pairs — this page is read, not filled): 8 numbered steps for completing the EAS with the other driver, the two do-not lines (don't sign fault admissions, don't sign what you can't read), and where each driver sends their copy. Marker box at bottom. This page carries the L2 sign-off line ("Reviewed for {country}, {date}") — the guidance is jurisdiction-touched, the form itself is standard.

**Empty/error.** None — this artifact is static per corridor pair; if a corridor's secondary locale pack is unsigned, the artifact ships in single-locale (standard) form rather than with unreviewed translations.

**Filing-grade extras.** Field labels must match official EAS semantics exactly (L2 checklist item); the artifact must remain legible at 90% scale (printers with margins); the sketch area must survive pencil.

---

## 3. Signed Pack Template (`IDA-SP-…`) — placeholder, finalized at MOB-DG05

Structure is fixed now so Vault/ceremony designs can reference it; content blocks await L1 (signature methods) and the s08 decision-record schema.

**P1 — Cover:** parties (member + contracting entity per T-407), case reference, governing law line, contents list, date block.
**P2..n — The agreements:** service agreement, POA/assignment — full text, per-country versions, each section numbered for citation.
**Signature evidence block (final page of each signed doc):** signer name · method (per L1 matrix vocabulary: drawn / typed+OTP / print-and-sign) · timestamp with timezone · document version hash · policy/terms versions accepted · the `m05`-lineage audit reference ID. Rendered as a bordered table — this block is what a counterparty's lawyer inspects first; it must look like it expects to be inspected.
**Consent record annex:** subjects, parties granted, timestamps, policy version (mirrors `ConsentSheet` records).
**Document manifest annex:** as Claim Pack manifest, covering everything in the case file at signature time.

**Open items (blocking finalization, tracked at MOB-DG05):** L1 method vocabulary per country; whether print-and-sign fallback pages need wet-signature margins per jurisdiction; cooling-off text placement (cover vs. final page) per L5.

---

## Production notes (for the design sprint, no runtime implied)

Deliver as: Figma page per artifact at A4, with a filled KS car-accident example (realistic data, catalog copy) and the empty-state variant; export test at grayscale 300dpi and 90% scale; hand the filled examples to L2/L5 reviewers as the review medium — reviewers sign the artifact they can see, not an abstract spec.
