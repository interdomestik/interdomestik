# Interdomestik V2: Membership Protection Platform

## Complete Implementation Plan — Membership-Sales-First

**Created**: 2025-12-20  
**Updated**: 2025-12-22  
**Status**: Phase 1 Completed / Testing Infrastructure Complete / Next: Member Interaction Logging + Commission Tracking  
**Version**: 3.1

---

## Executive Summary

Interdomestik is a **membership protection club** where revenue comes primarily from subscriptions, with **success-based mediation fees** only when members win claims. Agents are the sales force driving growth. Claims handling is an internal fulfillment function for members who need it.

**Business Model:**

```
Revenue = Memberships + Success-based mediation fees
Goal: 10,000 members = €200,000 ARR

Claims handling = Internal fulfillment (service delivery)
Success fees = Cost offset, not insurance underwriting
```

**Target**: 10,000 members in Year 1  
**Average Price**: €20/year  
**Agent Commission**: Tier-based for new sales + renewal bonus

---

# PART 1: BUSINESS MODEL (Membership-First)

## 1.1 Revenue Strategy

| Stream                    | Source               | Target Y1 |
| ------------------------- | -------------------- | --------- |
| **Membership Fees**       | Yearly subscriptions | €180,000  |
| **Success Fees**          | Claim mediation      | €40,000   |
| **B2B Packages**          | Company/fleet deals  | €30,000   |
| **Partner Referral Fees** | Discount network     | €10,000   |

**Success fee rate**: 15% of recovered amount (member pays only on success).

> **Claims handling is the core promise**; success fees are earned only on resolved cases.

## 1.2 Value Proposition

> "€20/vit. Mbrojtje 24/7. Ekspertë kur të duash."
> (€20/year. 24/7 protection. Experts when you need them.)

**What Members Get:**

- ✅ 24/7 emergency hotline
- ✅ **Voice Claim** — file a claim by phone in 60 seconds, no forms
- ✅ Legal consultations (plan-based limits)
- ✅ Damage calculator access
- ✅ Partner discount network (10-20% off)
- ✅ Expert guides and checklists
- ✅ Mediation fee discounts and priority handling when needed

## 1.3 Membership Tiers

| Plan         | Price           | Target                | Positioning               |
| ------------ | --------------- | --------------------- | ------------------------- |
| **Bazik**    | €15/year        | Individuals           | "Essential Protection"    |
| **Standard** | €20/year        | Families              | "Complete Peace of Mind"  |
| **Familja**  | €35/year        | Households (5 people) | "Whole Family, One Price" |
| **Biznes**   | €12/person/year | Companies (15+)       | "Protect Your Team"       |

### Tier Features

| Feature                | Bazik  | Standard  | Familja   | Biznes       |
| ---------------------- | ------ | --------- | --------- | ------------ |
| 24/7 Emergency Hotline | ✅     | ✅        | ✅        | ✅           |
| Legal Consultations    | 2/year | Unlimited | Unlimited | Unlimited    |
| Damage Calculator      | ✅     | ✅        | ✅        | ✅           |
| Partner Discounts      | ❌     | ✅        | ✅        | ✅           |
| Expert Guides          | ✅     | ✅        | ✅        | ✅           |
| Members Covered        | 1      | 1         | 5         | Per employee |
| Mediation fee discount | 25%    | 50%       | 50%       | 60%          |
| Company Advances Costs | ❌     | ✅        | ✅        | ✅           |
| Digital Card           | ✅     | ✅        | ✅        | ✅           |
| Dedicated Manager      | ❌     | ❌        | ❌        | ✅           |

**Mediation fee baseline**: 15% of recovered amount; discounts apply per tier.

## 1.4 Launch Tier Strategy

- **Phase 1 launch**: Standard (€20) + Familja (€35) only.
- **Future additions**: Bazik (retention offer) and Biznes (after 5 B2B deals).
- **B2B note**: no dedicated B2B portal until 5 manual deals are closed.

---

# PART 2: MEMBER VALUE JOURNEY

## 2.1 Immediate Deliverables (Day 0)

After signup, member receives:

| Deliverable                 | Format                    | Delivery    |
| --------------------------- | ------------------------- | ----------- |
| **Digital Membership Card** | PDF + Apple/Google Wallet | Email + SMS |
| **Emergency Wallet Card**   | Printable PDF             | Email       |
| **24/7 Hotline Number**     | SMS + Email               | Immediate   |
| **Thank-you letter**        | Branded PDF + email       | Immediate   |
| **Accident Checklist**      | PDF download              | Email       |
| **Consumer Rights Guide**   | PDF download              | Email       |
| **Partner Discount List**   | Web page                  | Dashboard   |

**Thank-you letter design requirements**

- Hotline number is the largest type on the page.
- Wallet button is the primary CTA.
- Optional QR code links to `{{dashboard_url}}`.

## 2.2 Member Dashboard

### Onboarding Flow (First 5 Minutes)

**Goal**: Deliver first value in under 5 minutes and reduce churn risk.

| Time | Step                    | UI Element                        | Success Signal                |
| ---- | ----------------------- | --------------------------------- | ----------------------------- |
| 0:00 | Thank-you page          | Confetti + plan summary + hotline | "Membership active" confirmed |
| 0:30 | Add to Wallet           | Primary CTA button                | Wallet card added             |
| 1:00 | Save hotline contact    | One-tap "Save Contact"            | Contact saved                 |
| 1:30 | Download checklist      | "Accident Checklist" quick action | Checklist opened              |
| 2:30 | Quick tour              | 3-step coach marks                | Tour completed                |
| 3:30 | Emergency contact (opt) | Simple form                       | Contact saved or skipped      |
| 4:30 | Referral share (opt)    | Share sheet + WhatsApp link       | Link copied/shared            |

**Activation definition**: Wallet added OR hotline saved, plus checklist opened.

**Fallback**: If any step is skipped, send reminder via email/SMS within 24h.

```
┌─────────────────────────────────────────────────────────────────┐
│  🛡️ Mirë se erdhe, Arben!                                      │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ 📇 KARTA JUAJ  │  │ 📞 LINJA 24/7   │  │ 🆘 NDIHME       │  │
│  │ [Add to Wallet]│  │ +383 XX XXX XXX │  │ [Thirr Tani]    │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  📚 PËRFITIMET TUAJ (3 nga 6 të përdorura)                     │
│  ────────────────────────────────────────                      │
│  ✅ Konsultë Ligjore (E pakufizuar)               [Përdor →]   │
│  ✅ Kalkulimi i Dëmit                              [Përdor →]   │
│  ⚠️ Kategorizimi i Lëndimeve (1 mbetur)           [Përdor →]   │
│  ✅ Udhëzues & Checklists                          [Shkarko →]  │
│  ✅ Rrjeti i Partnerëve (-15% zbritje)             [Shiko →]    │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  💰 KURSIMET TUAJA                                             │
│  Këtë vit keni kursyer: €45 nga partnerët                      │
│  Vlera e mbrojtjes: deri €50,000                               │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  🎁 FTONI MIQTË — FITONI BASHKË                                │
│  Ndajeni linkun tuaj: interdomestik.com/join/ARBEN123           │
│  Ju fitoni €5 • Miku fiton €5                    [Ndaj 📲]     │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  📰 ARTIKULLI I JAVËS                                          │
│  "7 Gabimet që bëjnë njerëzit pas një aksidenti"               │
│  [Lexo Tani →]                                                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Dashboard Widgets

| Widget               | Purpose                      | Talk Trigger          |
| -------------------- | ---------------------------- | --------------------- |
| **Protection Badge** | Show membership tier         | Status symbol         |
| **Coverage Value**   | "Protected up to €50,000"    | Big impressive number |
| **Services Used**    | "3 of 6 services used"       | Engagement            |
| **Partner Savings**  | "€45 saved this year"        | Concrete value        |
| **Referral Counter** | "2 friends protected"        | Social proof          |
| **Tenure Badge**     | "Member since Dec 2024"      | Loyalty indicator     |
| **Next Renewal**     | "Renew in 11 months → bonus" | Retention             |

## 2.3 Email Journey

### Welcome Sequence (Automated)

| Day    | Subject                                           | Content                        | Action          |
| ------ | ------------------------------------------------- | ------------------------------ | --------------- |
| **0**  | 🎉 Mirë se vini në Interdomestik!                 | Card + Emergency contacts      | Add to Wallet   |
| **1**  | 📱 Ruaje këtë numër tani                          | Hotline number, save to phone  | Save contact    |
| **3**  | 📚 Udhëzuesi i plotë: Çfarë bën pas një aksidenti | PDF guide                      | Download        |
| **7**  | 🎁 Dhuratë për miqtë tuaj                         | Referral program intro         | Share link      |
| **14** | 💰 E dini sa kurseni?                             | Calculator + partner discounts | Try calculator  |
| **30** | 🌟 Historia e suksesit                            | "How we helped Besnik..."      | Read story      |
| **60** | 📊 Përmbledhja juaj                               | Benefits used, value delivered | Check dashboard |
| **90** | 🛡️ 3 muaj të mbrojtur!                            | Quarterly summary              | Renew early?    |

### Monthly Newsletter

| Section                 | Content                                          |
| ----------------------- | ------------------------------------------------ |
| **Këshilla e Muajit**   | Practical tip (e.g., "How to photograph damage") |
| **Oferta e Partnerëve** | This month: 20% off at Car Service XYZ           |
| **Historia e Suksesit** | Real member case (with permission)               |
| **A e dini?**           | Legal rights people don't know                   |
| **Ftoni një mik**       | Referral reminder with link                      |

## 2.4 Push Notifications (App)

| Trigger         | Notification                                        |
| --------------- | --------------------------------------------------- |
| **Seasonal**    | ❄️ "Dimri po vjen — këshilla për vozitje të sigurt" |
| **Partner**     | 🎁 "Partner i ri: 20% zbritje tek Auto Glass"       |
| **Reminder**    | 📞 "A e keni ruajtur numrin e emergjencës?"         |
| **Achievement** | 🏆 "6 muaj anëtar! Bravo!"                          |
| **Referral**    | 🎉 "Miku juaj u bë anëtar! €5 u shtuan"             |

## 2.5 "Talk About Us" Triggers

| Moment               | What Member Does                       |
| -------------------- | -------------------------------------- |
| **Wallet Card**      | Shows digital card to friend           |
| **Referral Bonus**   | "Use my link, we both get €5"          |
| **Partner Discount** | "I saved 15% because of my membership" |
| **Calculator**       | "My car damage could be worth €3,000!" |
| **Newsletter Tip**   | Forwards useful article                |

---

# PART 2.6: BEST-PRACTICE MARKETING SYSTEM

## 2.6.1 High-Converting Offer Structure

- **Price anchoring**: Show "Typical claim value €1,500–€5,000" next to "€20/year".
- **Daily cost framing**: "€0.05/day" to lower perceived cost.
- **Risk reversal**: 30-day money-back guarantee + "Cancel anytime before renewal".
- **Speed promise**: "Case opened within 24 hours" (SLA badge).
- **Immediate value**: digital card + checklist delivered instantly.
- **Simple plan choice**: one recommended plan (Standard) + clear upgrade path.

### Pricing Page Structure (Recommended)

1. **Hero**: "€0.05/day. Ekspertë kur duhet."
2. **Trust strip**: verified stats + partner logos.
3. **Recommended plan**: Standard pre-selected with badge.
4. **Family upgrade**: clear value for Familja.
5. **Feature comparison**: short, focused list.
6. **FAQ**: top objections answered.
7. **Guarantee badge**: 30-day money-back.
8. **Sticky CTA (mobile)**: "Bëhu Anëtar".

## 2.6.2 Trust & Social Proof

- **Real results**: "€2.5M recovered • 5,000+ cases supported" (verify numbers).
- **Expert authority**: highlight legal, medical, and valuation specialists.
- **Partner logos**: clinics, workshops, law offices.
- **Testimonials**: 3–5 short case stories with before/after.

## 2.6.3 Conversion Triggers

- **Urgency**: seasonal messaging ("Winter accidents rise 30%").
- **Guarantee**: 30-day money-back guarantee.
- **First consultation free**: one 15-min expert call to demonstrate value.
- **First mediation fee waived**: no 15% success fee on the first resolved claim.
- **Membership activation**: "Coverage starts immediately after payment".
- **Referral incentive**: €5 give/get for members and agent link for sales.
- **Seasonal offer**: "Join in January, get February free" (limited-time).

## 2.6.4 Channels That Sell This Model

- **Agent network**: QR-based signups, WhatsApp share kit.
- **SEO + content**: accident checklists, damage calculator, rights guides.
- **Partner referrals**: clinics, car services, legal offices.
- **B2B**: HR outreach with "employee protection perk".

## 2.6.5 Channel Mix Budget (MVP)

| Channel                | Monthly Budget | Target CPA | Purpose                    |
| ---------------------- | -------------- | ---------- | -------------------------- |
| Agent network          | €0             | €3-5       | Primary growth engine      |
| Google Search (claims) | €500           | €6-10      | Capture urgent intent      |
| Retargeting (Meta/IG)  | €200           | €4-8       | Recover abandoned visitors |
| Partners (offline)     | €200           | €5-8       | Local trust + referrals    |
| Content/SEO            | €0             | €0-3       | Compounding organic leads  |

## 2.6.6 Positioning & Differentiation

- **Not insurance**: independent legal/technical assistance, paid only on success.
- **Member-first**: "We work for you, not the insurer."
- **Speed + certainty**: 24h response SLA, clear timeline.
- **Local expertise**: medical censors, legal experts, valuation specialists.

## 2.6.7 Audience Segments & Messaging

- **Drivers/commuters**: "Accident? One call and we handle the claim."
- **Families/homeowners**: "Property damage support without stress."
- **Workers**: "Workplace accident guidance and documentation."
- **SMEs**: "Employee protection perk with fixed annual cost."

## 2.6.8 Funnel Design & KPIs

```text
Awareness → Lead → Member → Activated → Retained
```

- **Primary conversion**: `/pricing` → checkout.
- **Activation**: digital card delivered + hotline saved + first checklist opened.
- **Retention**: renewal reminders + yearly savings summary.
- **Analytics events**: page_view, checkout_started, checkout_completed, card_added_to_wallet, hotline_saved, referral_link_shared, claim_filed.

## 2.6.9 Trust & Compliance Assets

- **Transparent contracts**: membership terms + success-fee agreement.
- **Refund policy**: 30-day money-back guarantee page.
- **Privacy & consent**: GDPR-compliant opt-in, data retention policy.
- **Clarity**: "Not an insurer" disclaimer to avoid confusion.

## 2.6.10 Sales Enablement (Agent-Facing)

- **Certification**: short onboarding quiz + badge.
- **Scripts**: 3 objection handlers + 60-second pitch.
- **Objection handling**: "I have insurance", "I won't need it", "Why pay now".
- **Proof pack**: 3 case studies + before/after compensation stories.
- **Share kits**: WhatsApp templates + QR brochure.

## 2.6.11 Social Media & Virality System

**Content pillars**

- **Education**: "What to do after an accident" tips, rights, checklists.
- **Proof**: success stories, before/after outcomes, timeline wins.
- **Community**: Q&A with experts, member spotlights, live sessions.
- **Safety**: seasonal driving tips, prevention content.

**Platforms**

- **TikTok/Reels**: 30-45s tips and myths.
- **Instagram**: carousel guides + member stories.
- **Facebook**: live Q&A + community group.
- **WhatsApp**: Business catalog + share kits + status updates.

**Shareable moments**

- Membership activation: shareable card + "Protected since 2024".
- Referral success: public recognition + small reward badge.
- Claim resolution: anonymized "We recovered €X" story.

## 2.6.12 Community & WhatsApp Strategy

- **WhatsApp Business**: official account, quick replies, catalog, click-to-WhatsApp ads.
- **Community groups**: "Asistenca Members" with weekly tips.
- **UGC loop**: member story submissions with consent.

## 2.6.13 Objection FAQ (Draft)

| Objection                  | Response                                                              |
| -------------------------- | --------------------------------------------------------------------- |
| "I have insurance"         | "We work for you, not the insurer, to maximize your compensation."    |
| "I won't have an accident" | "Most drivers face a claim within 5 years; €0.05/day buys certainty." |
| "€20 is too much"          | "That is less than a coffee per month and covers expert support."     |
| "I can do this myself"     | "We handle negotiations and documentation so you don't lose value."   |

## 2.6.14 Seasonal Launch Calendar

| Month    | Campaign                   | Rationale                  |
| -------- | -------------------------- | -------------------------- |
| January  | "New Year, New Protection" | Resolution season          |
| April    | "Spring Driving Season"    | More road trips            |
| October  | "Winter Prep"              | Accident spike approaching |
| December | "Gift a Membership"        | Holiday gifting            |

## 2.6.15 Success Story Template

- **Before**: accident summary, insurer offer
- **After**: recovered amount, timeline, member quote
- **Proof**: anonymized document or partner endorsement
- **CTA**: "Join now and get protected"

## 2.6.16 Competitive Response & Moat

- **If insurers copy**: position as independent advocate with expert network.
- **Moat 1**: trusted experts + partner network (hard to replicate quickly).
- **Moat 2**: tenure benefits (better terms after year 2).
- **Moat 3**: operational speed + case management playbook.

## 2.6.17 Diaspora Expansion (Balkan Diaspora)

- **Localized landing** for EU cities with high diaspora density.
- **WhatsApp referral hooks** for family-based sales.
- **Micro-influencers abroad** with referral codes.

## 2.6.18 Voice Claim — Unique Competitive Advantage

> **"Një thirrje. Kaq."** (One call. That's it.)

**The Problem**: After an accident, people are stressed, on the road, and not in a state to fill out forms.

**The Solution**: Members file claims by voice in 60 seconds:

1. **Call the 24/7 hotline** or **send a WhatsApp voice note**
2. **Describe what happened** in their own words
3. **Staff transcribes** and creates the claim draft
4. **Member confirms** via SMS/WhatsApp link

**Why It's Unique**:

- No forms to fill — just talk
- Works hands-free (critical after an accident)
- WhatsApp-native (matches Balkan usage patterns)
- No competitor offers this in the region

**Implementation**:

- Phase 4: Staff transcription (hotline calls)
- Phase 5: AI transcription (WhatsApp voice notes)

**Tagline**: "Pas aksidentit, nuk keni kohë për formularë. Thjesht na tregoni çfarë ndodhi."

## 2.6.19 Insurer Scorecard — Rate the Insurers

> **"Ne dijmë cilat sigurime paguajnë — dhe cilat jo."**
> (We know which insurers pay — and which don't.)

**What It Is**: Asistenca tracks how each insurance company treats members:

- Average payout vs. claimed amount
- Response time
- Dispute rate
- Member satisfaction score

**Why It's Unique**:

- Members see: "Insurance X pays 72% of claims quickly, Insurance Y fights 40%"
- Creates **data moat** over time (competitors can't replicate)
- Builds trust: "We're transparent about who we fight"
- Potential PR/media asset

**Implementation**: Phase 6 (8h)

**Data Source**: Internal claim outcomes + member surveys.

## 2.6.20 Settlement Advance — Get Money While You Wait

> **"Keni nevojë për para tani? Ne ju ndihmojmë."**
> (Need money now? We help.)

**What It Is**: For members waiting for settlement, Asistenca offers a small advance (€200-500) against the expected payout.

**Why It's Unique**:

- Members need money NOW for repairs, medical bills, etc.
- Insurer negotiations can take months
- Advance is deducted from final settlement (not a loan)
- Creates deep loyalty + differentiates from all competitors

**Legal Note**: Must be structured correctly (advance against settlement, not consumer loan).

**Implementation**: Phase 6+ (10h + financing partner).

**Eligibility**: Only for claims with high success probability (>80% Claim Score).

# PART 3: AGENT SALES SYSTEM

## 3.1 Role Definition

Agents are **external sales representatives** focused on:

- Selling memberships (primary job)
- Managing their sales pipeline (leads → deals)
- Earning commissions
- Tracking renewals

Agents do **NOT**:

- Handle claims
- Message members about claims
- Access claim details beyond status

## 3.2 Commission Structure

| Action                     | Commission        |
| -------------------------- | ----------------- |
| New membership (Bazik)     | €3                |
| New membership (Standard)  | €5                |
| New membership (Familja)   | €10               |
| Renewal (any tier)         | €2                |
| Upgrade (Bazik → Standard) | €2                |
| B2B deal closed            | 10% of first year |

### Monthly Bonuses

| Memberships Sold | Bonus                      |
| ---------------- | -------------------------- |
| 20+              | +€50                       |
| 50+              | +€150                      |
| 100+             | +€400 + "Gold Agent" badge |

## 3.3 Agent CRM (Sales Pipeline)

### CRM Tables

| Table            | Purpose                        |
| ---------------- | ------------------------------ |
| `crm_leads`      | Track potential customers      |
| `crm_activities` | Log calls, meetings, messages  |
| `crm_deals`      | Track conversion to membership |

### Lead Stages

```
LEAD → CONTACTED → QUALIFIED → PROPOSAL → WON/LOST
```

## 3.4 Agent Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  🏆 AGENT DASHBOARD — Arben Lila                               │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  📊 KËTË MUAJ                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ 12          │  │ €85         │  │ 3           │              │
│  │ Anëtarë të  │  │ Komisione   │  │ Përsëritje  │              │
│  │ rinj        │  │ të fituara  │  │ deri tani   │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  📋 PIPELINE (15 aktive)                                        │
│  ────────────────────────                                       │
│  Lead (8) → Kontaktuar (4) → Propozim (2) → Fituar (1)         │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  🔔 VEPRIME SOT                                                 │
│  • Thirr Besnik M. (propozim i hapur)                          │
│  • Follow-up me Albana K. (3 ditë pa kontakt)                  │
│  • 2 përsëritje skadojnë javën e ardhshme                      │
│                                                                 │
│  ═══════════════════════════════════════════════════════════    │
│                                                                 │
│  🔗 LINKU JUAJ I REFERIMIT                                      │
│  interdomestik.com/join/ARBEN-AGENT                             │
│  [Kopjo] [Ndaj në WhatsApp]                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 3.5 Agent Sales Tools

| Tool                       | Purpose                                      |
| -------------------------- | -------------------------------------------- |
| **Digital Brochure**       | PDF one-pager with QR code                   |
| **Quick Quote Calculator** | "Your car = €8,000 → Protection = €0.05/day" |
| **Objection Handlers**     | Pre-written responses                        |
| **WhatsApp Share Kit**     | One-tap send with message                    |
| **Success Stories**        | Case studies to share                        |
| **Pricing Tables**         | Visual tier comparison                       |

---

# PART 4: STAFF OPERATIONS (Internal)

## 4.1 Role Definition

Staff are **internal company employees** who:

- Handle claims when members need help
- Manage claim lifecycle
- Communicate with members
- Work from case queue

## 4.2 Claim Workflow

**Note**: This is internal fulfillment, not revenue-generating.

| Stage        | Staff Action        | SLA |
| ------------ | ------------------- | --- |
| Filed        | Review, assign      | 24h |
| Intake       | Initial assessment  | 48h |
| Verification | Request documents   | 7d  |
| Assessment   | Expert evaluation   | 14d |
| Negotiation  | Insurer discussions | 30d |
| Resolution   | Member decision     | 7d  |
| Closed       | Archive             | —   |

## 4.3 Staff Dashboard

- Case queue (unassigned)
- My cases (assigned to me)
- SLA alerts (overdue)
- Internal notes
- Member communication

---

# PART 5: ROLE PERMISSIONS

| Action                                  | Lead | Member   | Agent           | Staff | Admin |
| --------------------------------------- | ---- | -------- | --------------- | ----- | ----- |
| View public content                     | ✅   | ✅       | ✅              | ✅    | ✅    |
| Subscribe                               | ✅   | ✅       | ❌              | ❌    | ❌    |
| Access dashboard                        | ❌   | ✅       | ✅              | ✅    | ✅    |
| Use free resources (guides, calculator) | ✅   | ✅       | ✅              | ✅    | ✅    |
| File a claim                            | ❌   | ✅       | ❌              | ❌    | ❌    |
| View claim status                       | ❌   | ✅ (own) | ✅ (stage only) | ✅    | ✅    |
| Handle claims                           | ❌   | ❌       | ❌              | ✅    | ✅    |
| Manage leads/deals                      | ❌   | ❌       | ✅ (own)        | ❌    | ✅    |
| Sell memberships                        | ❌   | ❌       | ✅              | ❌    | ✅    |
| View commissions                        | ❌   | ❌       | ✅ (own)        | ❌    | ✅    |
| Manage users                            | ❌   | ❌       | ❌              | ❌    | ✅    |
| View all analytics                      | ❌   | ❌       | ❌              | ✅    | ✅    |

---

# PART 6: DATABASE SCHEMA

## 6.1 New Tables

```sql
-- Membership Plans
CREATE TABLE membership_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  display_name_sq TEXT NOT NULL,
  display_name_en TEXT,
  price_cents INTEGER NOT NULL,
  currency TEXT DEFAULT 'EUR',
  max_family_members INTEGER DEFAULT 1,
  included_services JSONB NOT NULL,
  service_limits JSONB,
  discount_percent INTEGER DEFAULT 0,
  partner_discounts BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User Memberships
CREATE TABLE memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES user(id) NOT NULL,
  plan_id TEXT REFERENCES membership_plans(id) NOT NULL,
  status TEXT NOT NULL,
  started_at TIMESTAMP NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  referred_by_agent TEXT REFERENCES user(id),
  referred_by_member TEXT REFERENCES user(id),
  referral_code TEXT UNIQUE,
  acquisition_source TEXT,               -- 'agent', 'referral', 'organic', 'partner'
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  payment_id TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Family Members
CREATE TABLE membership_family_members (
  id TEXT PRIMARY KEY,
  membership_id TEXT REFERENCES memberships(id) NOT NULL,
  user_id TEXT REFERENCES user(id),
  name TEXT NOT NULL,
  relationship TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Agent CRM Leads
CREATE TABLE crm_leads (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES user(id) NOT NULL,
  type TEXT NOT NULL,
  full_name TEXT,
  company_name TEXT,
  phone TEXT,
  email TEXT,
  source TEXT,
  stage TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  notes TEXT,
  last_contacted_at TIMESTAMP,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- CRM Activities
CREATE TABLE crm_activities (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES crm_leads(id) NOT NULL,
  agent_id TEXT REFERENCES user(id) NOT NULL,
  type TEXT NOT NULL,
  summary TEXT NOT NULL,
  scheduled_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- CRM Deals
CREATE TABLE crm_deals (
  id TEXT PRIMARY KEY,
  lead_id TEXT REFERENCES crm_leads(id) NOT NULL,
  agent_id TEXT REFERENCES user(id) NOT NULL,
  membership_plan_id TEXT REFERENCES membership_plans(id),
  value_cents INTEGER DEFAULT 0,
  stage TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  closed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Agent-Client Relationship
CREATE TABLE agent_clients (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES user(id) NOT NULL,
  member_id TEXT REFERENCES user(id) NOT NULL,
  source TEXT DEFAULT 'referral',
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(agent_id, member_id)
);

-- Agent Commissions
CREATE TABLE agent_commissions (
  id TEXT PRIMARY KEY,
  agent_id TEXT REFERENCES user(id) NOT NULL,
  membership_id TEXT REFERENCES memberships(id) NOT NULL,
  type TEXT DEFAULT 'new',
  amount_cents INTEGER NOT NULL,
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Member Referrals
CREATE TABLE referrals (
  id TEXT PRIMARY KEY,
  referrer_id TEXT REFERENCES user(id) NOT NULL,
  referred_id TEXT REFERENCES user(id) NOT NULL,
  referral_code TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  referrer_reward_cents INTEGER,
  referred_reward_cents INTEGER,
  rewarded_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Service Usage
CREATE TABLE service_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES user(id) NOT NULL,
  membership_id TEXT REFERENCES memberships(id) NOT NULL,
  service_code TEXT NOT NULL,
  used_at TIMESTAMP DEFAULT NOW()
);

-- Service Requests (non-claim consultations)
CREATE TABLE service_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES user(id) NOT NULL,
  membership_id TEXT REFERENCES memberships(id),
  service_code TEXT NOT NULL,             -- 'legal_consult', 'injury_cat', 'hotline'
  status TEXT DEFAULT 'open',             -- 'open', 'in_progress', 'closed'
  handled_by TEXT REFERENCES user(id),
  requested_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP,
  notes TEXT
);

-- Partner Discounts Used
CREATE TABLE partner_discount_usage (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES user(id) NOT NULL,
  partner_name TEXT NOT NULL,
  estimated_savings_cents INTEGER,
  used_at TIMESTAMP DEFAULT NOW()
);

-- Lead Downloads
CREATE TABLE lead_downloads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  resource_code TEXT NOT NULL,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  marketing_opt_in BOOLEAN DEFAULT false,
  converted_to_member BOOLEAN DEFAULT false,
  downloaded_at TIMESTAMP DEFAULT NOW()
);

-- Claim Stage History
CREATE TABLE claim_stage_history (
  id TEXT PRIMARY KEY,
  claim_id TEXT REFERENCES claim(id) NOT NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  changed_by TEXT REFERENCES user(id) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX crm_leads_agent_stage_idx ON crm_leads(agent_id, stage);
CREATE INDEX crm_deals_agent_status_idx ON crm_deals(agent_id, status);
CREATE INDEX agent_clients_agent_idx ON agent_clients(agent_id);
CREATE INDEX memberships_user_idx ON memberships(user_id);
```

## 6.2 Modified Tables

```sql
-- Users: role + consent + referral
ALTER TABLE user ADD COLUMN role TEXT DEFAULT 'lead';
ALTER TABLE user ADD COLUMN referral_code TEXT UNIQUE;
ALTER TABLE user ADD COLUMN marketing_opt_in BOOLEAN DEFAULT false;
ALTER TABLE user ADD COLUMN consent_at TIMESTAMP;

-- Claims: staff ownership (agents do not handle claims)
ALTER TABLE claim ADD COLUMN staff_assignee_id TEXT REFERENCES user(id);
ALTER TABLE claim ADD COLUMN stage TEXT DEFAULT 'filed';
ALTER TABLE claim ADD COLUMN updated_at TIMESTAMP DEFAULT NOW();
```

**Membership status policy**

- `active`: paid and valid
- `grace`: renewal failed but access temporarily allowed for 14 days
- `expired`: membership ended
- `canceled`: manually canceled
- **Refund window**: 30 days from start (no-questions-asked)
- **Downgrade/lock**: after grace, access to member features is locked.
- **Dunning**: 3 recovery attempts during grace before downgrade.

---

# PART 7: ROUTE STRUCTURE

## 7.1 Public (Marketing)

| Route                 | Purpose                    | Priority |
| --------------------- | -------------------------- | -------- |
| `/`                   | Homepage                   | P0       |
| `/pricing`            | Plan comparison            | P0       |
| `/services`           | What's included            | P0       |
| `/resources`          | Free guides (lead magnets) | P0       |
| `/tools/calculator`   | Damage calculator          | P1       |
| `/faq`                | Objections + FAQs          | P0       |
| `/legal/terms`        | Terms of membership        | P0       |
| `/legal/privacy`      | Privacy policy             | P0       |
| `/legal/refund`       | 30-day guarantee policy    | P0       |
| `/legal/success-fee`  | Success-fee disclosure     | P1       |
| `/join/[code]`        | Referral landing           | P0       |
| `/login`, `/register` | Auth                       | P0       |

## 7.2 Member Portal (`/dashboard`)

| Route                        | Purpose             | Priority |
| ---------------------------- | ------------------- | -------- |
| `/dashboard`                 | Main dashboard      | P0       |
| `/dashboard/membership`      | Plan, renewal       | P0       |
| `/dashboard/membership/card` | Digital card        | P0       |
| `/dashboard/benefits`        | Services, usage     | P0       |
| `/dashboard/partners`        | Discount network    | P1       |
| `/dashboard/referrals`       | Referral stats      | P1       |
| `/dashboard/claims`          | Claim list (if any) | P1       |
| `/dashboard/claims/new`      | File new claim      | P1       |
| `/dashboard/claims/[id]`     | Claim timeline      | P1       |
| `/dashboard/settings`        | Account             | P0       |

## 7.3 Agent Portal (`/agent`)

| Route                | Purpose          | Priority |
| -------------------- | ---------------- | -------- |
| `/agent`             | Sales dashboard  | P0       |
| `/agent/crm`         | Pipeline board   | P0       |
| `/agent/leads`       | Lead management  | P0       |
| `/agent/deals`       | Deal tracking    | P0       |
| `/agent/clients`     | Member portfolio | P0       |
| `/agent/renewals`    | Renewals due     | P1       |
| `/agent/commissions` | Earnings         | P1       |
| `/agent/materials`   | Sales tools      | P2       |

## 7.4 Staff Portal (`/staff`)

| Route                | Purpose          | Priority |
| -------------------- | ---------------- | -------- |
| `/staff`             | Queue overview   | P0       |
| `/staff/queue`       | Unassigned cases | P0       |
| `/staff/claims`      | All claims       | P0       |
| `/staff/claims/[id]` | Claim detail     | P0       |

## 7.5 Admin Portal (`/admin`)

| Route            | Purpose           | Priority |
| ---------------- | ----------------- | -------- |
| `/admin`         | Analytics         | P0       |
| `/admin/plans`   | Plan management   | P0       |
| `/admin/users`   | User management   | P0       |
| `/admin/agents`  | Agent performance | P1       |
| `/admin/reports` | Revenue, growth   | P1       |

---

# PART 8: IMPLEMENTATION PHASES

## Phase 0: Pre-Launch Validation (Week 0) 🔴 Critical

**Goal**: Validate demand and pricing before full build.

| Task                                           | Effort | Owner     |
| ---------------------------------------------- | ------ | --------- |
| Soft launch with 50 members                    | 6h     | Ops       |
| Landing page A/B test (headline + CTA)         | 4h     | Frontend  |
| Price sensitivity survey (100 leads)           | 4h     | Ops       |
| Pre-launch waitlist + email capture            | 4h     | Frontend  |
| 3-month content calendar                       | 4h     | Marketing |
| Record 10 short-form videos                    | 8h     | Marketing |
| WhatsApp Business setup                        | 2h     | Marketing |
| Identify 5 micro-influencers                   | 4h     | Marketing |
| Legal templates (6 docs)                       | 6h     | Legal     |
| Operations playbook                            | 6h     | Ops       |
| Financial model                                | 6h     | Founder   |
| Soft launch success criteria                   | 2h     | Founder   |
| Expert network (7 contacts)                    | 4h     | Ops       |
| Branding finalized ("Asistenca")               | 4h     | Marketing |
| Analytics setup (PostHog or GA4)               | 4h     | Backend   |
| Event tracking plan document                   | 2h     | Founder   |
| 24/7 hotline provider selection                | 4h     | Ops       |
| Hotline script + escalation rules              | 4h     | Ops       |
| After-hours coverage decision                  | 2h     | Founder   |
| Agent recruitment strategy                     | 4h     | Founder   |
| First 5 agent outreach                         | 8h     | Ops       |
| First 5 minutes UX spec                        | 2h     | UX        |
| Dev seed pack (members, agents, staff, claims) | 4h     | Backend   |

**Deliverable**: Early signal on conversion and pricing.

## Phase 1: Membership Infrastructure (Weeks 1-2) 🔴 Critical

**Goal**: Enable buying and basic member experience

| Task                                      | Effort | Owner      |
| ----------------------------------------- | ------ | ---------- |
| Database migration (membership tables)    | 4h     | Backend    |
| Seed membership plans (Standard, Familja) | 2h     | Backend    |
| Paddle subscription integration           | 8h     | Backend    |
| 30-day money-back guarantee policy        | 2h     | Backend    |
| Subscription webhooks (renew/cancel/fail) | 4h     | Backend    |
| Legal pages (terms, privacy, refund)      | 4h     | Frontend   |
| Success-fee agreement disclosure          | 2h     | Frontend   |
| Attribution capture (UTM + source)        | 4h     | Backend    |
| `/pricing` page with plan comparison      | 4h     | Frontend   |
| FAQ + objection handling page             | 3h     | Frontend   |
| 3 case study pages                        | 4h     | Frontend   |
| 1-click Apple/Google Pay checkout         | 4h     | Backend    |
| QR code signup flow                       | 4h     | Frontend   |
| Homepage SLA + speed promise              | 2h     | Frontend   |
| Checkout flow                             | 6h     | Full-stack |
| Thank-you letter (email + PDF + QR)       | 2h     | Design     |
| Member dashboard with card + benefits     | 8h     | Frontend   |
| Digital card + Wallet integration         | 6h     | Full-stack |
| Welcome email sequence (Day 0, 1, 3)      | 4h     | Backend    |
| Membership gate on claim filing           | 2h     | Backend    |
| Member onboarding flow (first 5 min)      | 4h     | Frontend   |
| Cancellation flow + exit survey           | 3h     | Full-stack |
| Win-back email (30 days after cancel)     | 2h     | Backend    |
| PWA manifest + install prompt             | 2h     | Frontend   |
| Offline caching for dashboard shell       | 4h     | Frontend   |
| Dunning email sequence (3 attempts)       | 4h     | Backend    |
| Grace period enforcement (14 days)        | 2h     | Backend    |
| Downgrade/lock after grace period         | 2h     | Backend    |

**Deliverable**: People can BUY memberships and see value.

## Phase 1.1: Portal Governance & Role Enforcement (Post-launch)

**Goal**: Align experience naming and enforce strict portal boundaries.

| Task                                                                            | Effort | Owner    |
| ------------------------------------------------------------------------------- | ------ | -------- |
| Rename `/dashboard` → `/member`, add locale-aware redirect, and update links/tests | 4h     | Frontend |
| Enforce portal redirects from member layout so agents/staff/admins land on `/agent`, `/staff`, `/admin` | 3h     | Backend  |
| Confirm agent nav links point to `/agent/*`, staff/all-claims view references `/staff/claims` only | 2h     | Frontend |
| Update RBAC e2e fixtures + tests to assert new routes                             | 2h     | QA       |

**Deliverable**: Portal names match the plan, and users are funneled into their portals without cross-traffic.

## Phase 2: Agent Sales System (Weeks 3-4) 🔴 Critical

**Goal**: Enable agents to sell memberships

| Task                                  | Effort | Owner      |
| ------------------------------------- | ------ | ---------- |
| CRM tables (leads, activities, deals) | 4h     | Backend    |
| Agent dashboard                       | 6h     | Frontend   |
| `/agent/crm` pipeline board           | 8h     | Frontend   |
| `/agent/leads` list + detail          | 6h     | Frontend   |
| `/agent/deals` + conversion           | 6h     | Frontend   |
| Deal-won conversion to membership     | 4h     | Backend    |
| `/agent/clients` member portfolio     | 4h     | Frontend   |
| Commission tracking                   | 4h     | Backend    |
| Agent referral link system            | 4h     | Backend    |
| Manual agent onboarding flow          | 3h     | Backend    |
| Sales materials page                  | 4h     | Frontend   |
| Agent script approval + certification | 4h     | Ops        |
| Mystery shopping checks               | 3h     | Ops        |
| Admin agent creation + approval flow  | 4h     | Full-stack |
| RLS for agent data isolation          | 4h     | Backend    |

**Deliverable**: Agents can manage pipeline and earn commissions.

## Phase 3: Referral & Engagement (Week 5) 🟡 High

**Goal**: Enable viral growth

| Task                                 | Effort | Owner      |
| ------------------------------------ | ------ | ---------- |
| Member referral system               | 6h     | Backend    |
| Referral dashboard widget            | 4h     | Frontend   |
| Referral landing page `/join/[code]` | 4h     | Frontend   |
| Partner discount network             | 4h     | Backend    |
| Partner page in member portal        | 4h     | Frontend   |
| Partner onboarding kit (B2B + local) | 4h     | Ops        |
| Usage tracking (services used)       | 4h     | Backend    |
| Savings calculator widget            | 4h     | Frontend   |
| Agent leaderboard widget             | 4h     | Frontend   |
| Agent quick-start bonus system       | 2h     | Backend    |
| Partner endorsement collection       | 4h     | Ops        |
| Launch #AsistencaChallenge campaign  | 4h     | Marketing  |
| UGC submission flow                  | 4h     | Frontend   |
| Shareable card + Story template      | 4h     | Design     |
| Influencer outreach campaign         | 8h     | Marketing  |
| Public stats page (verified only)    | 4h     | Frontend   |
| WhatsApp Bot (v1 routing)            | 8h     | Full-stack |
| Admin partner management CRUD        | 4h     | Full-stack |

**Deliverable**: Members can refer friends and see savings.

## Phase 4: Staff Operations (Weeks 6-7) 🟡 High

**Goal**: Internal claim handling capability

| Task                                        | Effort | Owner      |
| ------------------------------------------- | ------ | ---------- |
| Staff role and permissions                  | 4h     | Backend    |
| `/staff/queue` page                         | 6h     | Frontend   |
| Claim assignment system                     | 4h     | Backend    |
| Staff claim detail page                     | 8h     | Frontend   |
| Internal notes system                       | 4h     | Backend    |
| SLA tracking                                | 4h     | Backend    |
| Member-staff messaging                      | 6h     | Full-stack |
| Claim tracker (member view)                 | 6h     | Frontend   |
| Voice Claim (hotline + staff transcription) | 4h     | Ops        |
| Voice claim intake script                   | 2h     | Ops        |
| Staff all-claims queue (`/staff/claims`) with global permissions | 4h | Frontend |

**Deliverable**: Staff can handle claims internally + voice claims.

## Phase 5: Email & Engagement (Week 8) 🟢 Medium

**Goal**: Ongoing member engagement

| Task                                        | Effort | Owner      |
| ------------------------------------------- | ------ | ---------- |
| Full email sequence (Day 7, 14, 30, 60, 90) | 6h     | Backend    |
| Monthly newsletter template                 | 4h     | Design     |
| Push notification system                    | 6h     | Full-stack |
| Seasonal campaign triggers                  | 4h     | Backend    |
| Annual summary report                       | 4h     | Backend    |
| Annual Protection Report email              | 4h     | Backend    |
| NPS survey automation                       | 4h     | Backend    |
| Churn prediction model                      | 8h     | Backend    |
| AI claim assistant (v1)                     | 12h    | Full-stack |
| Asistenca Wrapped (annual)                  | 6h     | Backend    |
| AI document scanner                         | 8h     | Full-stack |
| Voice Claim AI (WhatsApp + transcription)   | 12h    | Full-stack |
| Albanian speech-to-text tuning              | 8h     | Backend    |

**Deliverable**: Members receive ongoing value.

## Phase 6: Analytics & Scale (Weeks 9-10) 🔵 Low

**Goal**: Optimize and grow

| Task                                   | Effort | Owner      |
| -------------------------------------- | ------ | ---------- |
| Admin analytics dashboard              | 8h     | Frontend   |
| Revenue tracking                       | 4h     | Backend    |
| Agent performance reports              | 4h     | Backend    |
| Conversion funnel tracking             | 4h     | Backend    |
| A/B testing setup                      | 6h     | Full-stack |
| Insurer Scorecard (data model + UI)    | 8h     | Full-stack |
| Insurer rating collection (claims)     | 4h     | Backend    |
| Settlement Advance (policy + flow)     | 6h     | Full-stack |
| Settlement Advance partner integration | 4h     | Ops        |

**Deliverable**: Data-driven optimization + unique competitive advantages.

---

## Effort Summary (Estimated)

| Phase   | Hours |
| ------- | ----- |
| Phase 0 | 64h   |
| Phase 1 | 73h   |
| Phase 2 | 60h   |
| Phase 3 | 70h   |
| Phase 4 | 42h   |
| Phase 5 | 62h   |
| Phase 6 | 26h   |
| Total   | 397h  |

**Timeline**: ~10 weeks at 40h/week.
**Note**: estimates are baseline and should be re-checked after staffing.

---

## Phase Dependencies

- **Apple/Google Pay**: requires Paddle support + merchant approval.
- **Homepage SLA promise**: requires staffing and 24h response coverage.
- **Public stats page**: requires verified metrics + legal approval.
- **WhatsApp Bot**: requires WhatsApp Business approval + escalation routing.
- **Claim tracker**: requires claim stage history + staff workflow in Phase 4.
- **AI claim assistant**: requires documented workflows + compliant data usage.
- **AI document scanner**: requires secure document storage + consent policy.
- **Partner discounts**: requires signed partner agreements and offer terms.

# Optional Enhancements (Nice-to-Have)

| Enhancement         | Value                       | Phase |
| ------------------- | --------------------------- | ----- |
| Dark mode           | Modern UX expectation       | 3     |
| Family member login | Individual cards per member | 3     |
| Offline card access | Card available without data | 5     |
| Renewal discount    | "Renew early, save €2"      | 5     |
| Tenure rewards      | Year 2+ partner discounts   | 5     |

---

# i18n & next-intl Checklist

- All new pages and flows must use next-intl (no hard-coded strings).
- Translation files: `sq`, `en`, `sr`, `mk` kept in sync on each release.
- Pre-release check: fail build if `MISSING_MESSAGE` is detected.
- Locale QA: verify pricing, membership, and claim flows in each locale.
- Legal copy localized (terms, refund, success-fee disclosure).

## Locale Test Matrix (per release)

| Locale | Must-test pages                                             |
| ------ | ----------------------------------------------------------- |
| sq     | /pricing, /dashboard, /dashboard/claims/new, /agent, /staff |
| en     | /pricing, /dashboard, /dashboard/claims/new, /agent, /staff |
| sr     | /pricing, /dashboard, /dashboard/claims/new, /agent, /staff |
| mk     | /pricing, /dashboard, /dashboard/claims/new, /agent, /staff |

---

# PART 8.5: TESTING INFRASTRUCTURE ✅ COMPLETE

## Unit Test Coverage (Dec 22, 2025)

All component directories at 100% coverage:

| Directory        | Components | With Tests | Coverage    |
| ---------------- | ---------- | ---------- | ----------- |
| `claims/`        | 7          | 7          | **100%** ✅ |
| `agent/`         | 11         | 11         | **100%** ✅ |
| `admin/`         | 10         | 10         | **100%** ✅ |
| `dashboard/`     | 9          | 9          | **100%** ✅ |
| `auth/`          | 6          | 6          | **100%** ✅ |
| `messaging/`     | 3          | 3          | **100%** ✅ |
| `pricing/`       | 1          | 1          | **100%** ✅ |
| `settings/`      | 2          | 2          | **100%** ✅ |
| `notifications/` | 2          | 2          | **100%** ✅ |

**Total Unit Tests: 438 passing**

### Unit Test Stack

- **Framework**: Vitest
- **Testing Library**: React Testing Library
- **Mocking**: vi.mock for next-intl, react-hook-form, UI components

## E2E Test Coverage

### Role-Based Access Control Tests (63 tests)

| Test File                 | Description                          | Tests |
| ------------------------- | ------------------------------------ | ----- |
| `rbac.spec.ts`            | Strict role permission verification  | 22    |
| `multi-user-flow.spec.ts` | Cross-role workflows, data isolation | 17    |
| `api-permissions.spec.ts` | API endpoint authorization           | 24    |

### User Journey Tests (40+ tests)

| Test File             | Description                        | Tests |
| --------------------- | ---------------------------------- | ----- |
| `member-flow.spec.ts` | Member dashboard, claims, settings | 10    |
| `staff-flow.spec.ts`  | Staff workspace, claims queue      | 6     |
| `admin-flow.spec.ts`  | Admin dashboard, users, analytics  | 12    |
| `agent-flow.spec.ts`  | Agent claims (view-only), CRM      | 8     |

### Other E2E Tests

| Test File                 | Description                         |
| ------------------------- | ----------------------------------- |
| `auth.spec.ts`            | Login, registration, password flows |
| `claims.spec.ts`          | Claim creation, status, evidence    |
| `member-settings.spec.ts` | Profile, language, notifications    |
| `pricing.spec.ts`         | Pricing page, checkout flow         |
| `messaging.spec.ts`       | Claim messaging, thread display     |

**Total E2E Tests: 100+ passing**

## Role Permission Matrix (Verified by E2E)

| Action                  | Member | Agent | Staff | Admin |
| ----------------------- | ------ | ----- | ----- | ----- |
| Access /dashboard       | ✅     | ✅    | ✅    | ✅    |
| Access /admin           | ❌     | ❌    | ❌    | ✅    |
| Access /admin/claims    | ❌     | ❌    | ❌    | ✅    |
| Access /admin/users     | ❌     | ❌    | ❌    | ✅    |
| Access /agent           | ❌     | ✅    | ✅    | ✅    |
| File claims             | ✅     | ❌    | ❌    | ❌    |
| View own claims         | ✅     | ✅\*  | ✅    | ✅    |
| Review claims (actions) | ❌     | ❌    | ✅    | ✅    |
| Edit claim status       | ❌     | ❌    | ✅    | ✅    |

\*Agent sees client claims status only (view-only)

## Test Seeding Infrastructure

Multi-user test database seeding (`scripts/seed-e2e-users.mjs`):

| User Type | Count | Email Pattern                         |
| --------- | ----- | ------------------------------------- |
| Members   | 10    | `test-worker{0-9}@interdomestik.com`  |
| Agents    | 10    | `agent-worker{0-9}@interdomestik.com` |
| Staff     | 4     | `staff@...`, `staff-worker{0-2}@...`  |
| Admins    | 2     | `admin@...`, `admin2@...`             |
| Claims    | 50    | 5 per member worker                   |

## Test Commands

```bash
# Run all unit tests
pnpm test:unit

# Run E2E tests
pnpm test:e2e

# Run specific E2E suite
pnpm exec playwright test e2e/rbac.spec.ts

# Run tests with coverage
pnpm test:coverage
```

## QA Checklist (per release)

- [ ] All unit tests pass (438)
- [ ] All E2E tests pass (100+)
- [ ] RBAC tests verify role restrictions
- [ ] API permission tests verify backend auth
- [ ] Build completes without errors
- [ ] i18n completeness verified
- [ ] Lint errors resolved

---

# Release & QA Gates

- **Feature flags**: `FEATURE_MEMBERSHIP_V2`, `FEATURE_AGENT_CRM`, `FEATURE_STAFF_CLAIMS`, `FEATURE_REFERRALS`, `FEATURE_WHATSAPP`.
- **Rollout order**: internal staff -> agents -> public.
- **QA gates**: typecheck + lint + smoke tests (membership signup, dashboard, claim gate, agent CRM) + a11y spot-check.
- **Rollback**: disable flags to revert to legacy flows.

---

# PART 9: SUCCESS METRICS

## 9.1 Acquisition Metrics

| Metric                | Target  | Formula                     |
| --------------------- | ------- | --------------------------- |
| New members/month     | 500+    | Signups per month           |
| Agent conversion rate | 15%     | Leads → Members             |
| Referral rate         | 20%     | New members via referral    |
| Family bundle rate    | 30%     | Familja plans as % of sales |
| B2B contribution      | 20%     | Members from company deals  |
| Time to first value   | < 5 min | Card issued + hotline saved |

## 9.2 Revenue Metrics

| Metric            | Target Y1 | Calculation             |
| ----------------- | --------- | ----------------------- |
| Total Members     | 10,000    | Active subscriptions    |
| ARR               | €200,000  | Members × avg price     |
| Success Fees      | €40,000   | % of recovered claims   |
| Agent Commissions | €25,000   | Sales × commission rate |
| Partner Revenue   | €10,000   | Referral fees           |

## 9.3 Retention Metrics

| Metric            | Target | Formula              |
| ----------------- | ------ | -------------------- |
| Year 1 Renewal    | 70%    | Renew at 12 months   |
| Year 2 Renewal    | 80%    | Renew at 24 months   |
| Active Engagement | 50%    | Login within 30 days |
| NPS               | 40+    | Survey score         |

## 9.4 Agent Metrics

| Metric            | Target           | Formula               |
| ----------------- | ---------------- | --------------------- |
| Deals/agent/month | 10+              | Memberships per agent |
| Pipeline velocity | 14 days          | Lead to close time    |
| Commission payout | €100/agent/month | Average earnings      |
| Agent activation  | 70%              | Sell 1+ in first week |

## 9.5 Marketing Metrics

| Metric                | Target | Formula                         |
| --------------------- | ------ | ------------------------------- |
| Landing page CVR      | 4%+    | Visits → checkout start         |
| Checkout completion   | 70%+   | Checkout start → paid           |
| CAC                   | €5-10  | Spend / paid members            |
| Refund rate           | < 5%   | Refunds / new members           |
| Activation rate       | 60%+   | Card issued + hotline saved     |
| Referral contribution | 20%    | Members from referral codes     |
| MQL → SQL rate        | 30%    | Leads → qualified (sales-ready) |
| Content engagement    | 20%    | Email open rate                 |
| Social engagement     | 5%+    | Engagement rate on social posts |
| UGC submissions       | 10/mo  | Member stories submitted        |
| WhatsApp inquiries    | 50/mo  | Click-to-WhatsApp conversions   |

## 9.6 Risks & Mitigations

| Risk                   | Mitigation                                                   |
| ---------------------- | ------------------------------------------------------------ |
| Churn without claims   | Annual Protection Report + partner discounts + monthly value |
| Agent quality control  | Script approval + certification + random mystery shopping    |
| Refund abuse           | Track refund rate by channel, investigate if >5%             |
| Low agent productivity | Quick-start bonus + leaderboard + weekly coaching            |

---

# PART 10: KEY DECISIONS

## Confirmed ✅

- [x] Membership sales = primary revenue
- [x] Agents = sales force (no claims)
- [x] Claims = internal fulfillment (later phase)
- [x] Tier-based commission + renewal bonus
- [x] Digital card with Wallet support
- [x] Referral program €5 give/get

## Finalized ✅

| Decision         | Value            |
| ---------------- | ---------------- |
| Payment provider | Paddle           |
| Risk reversal    | 30-day guarantee |
| B2B minimum      | 15 employees     |
| Agent onboarding | Manual first     |
| Success fee rate | 15%              |
| Familja price    | €35              |
| SLA guarantee    | 24h              |
| Grace period     | 14 days          |

---

# PART 11: PRE-LAUNCH REQUIREMENTS

| Requirement                      | Owner     | Deadline            |
| -------------------------------- | --------- | ------------------- |
| Legal templates (6 docs)         | Legal     | Before Phase 1      |
| Financial model                  | Founder   | Before Phase 1      |
| Operations playbook              | Ops       | Before Phase 1      |
| Expert network (7 contacts)      | Ops       | Before Phase 1      |
| Soft launch success criteria     | Founder   | Before Phase 0 ends |
| Branding finalized ("Asistenca") | Marketing | Before Phase 0      |
| Hotline coverage decision        | Ops       | Before Phase 0 ends |
| Analytics setup + tracking plan  | Founder   | Before Phase 0 ends |
| Agent recruitment plan           | Founder   | Before Phase 0 ends |

---

**Document Status**: Ready for implementation.

**Priority Order**:

1. Phase 0: Pre-launch validation
2. Phase 1: Membership sales infrastructure
3. Phase 2: Agent CRM and sales tools
4. Phase 3: Referral and engagement
5. Phase 4+: Claims handling (internal)

**Next Step**: Run Phase 0 validation (soft launch + A/B + pricing survey).
