---
plan_role: input
status: active
source_of_truth: false
owner: platform
last_reviewed: 2026-03-09
parent_program: docs/plans/current-program.md
parent_tracker: docs/plans/current-tracker.md
---

# Interdomestik Business Model Blueprint V1

> Status: Active supporting input. This document defines the commercial blueprint for a claims-first Interdomestik launch. It aligns to the existing V3 operating model: multi-role portals, staff-led handling, and strict isolation remain unchanged.

## Decision Summary

Interdomestik V1 should launch as a three-step commercial model:

1. `Free Start` for self-serve claim preparation
2. annual membership for fast human triage and guided handling
3. success-fee escalation only when Interdomestik staff actively recover money

This model keeps the current product direction intact while making the offer clearer, more enforceable, and easier to distribute through agents and later group channels.

## V1 Scope

### In Scope For Launch

- vehicle damage claims
- property damage claims
- personal injury claims with monetary recovery path

### Phase-2 Optional Scope

- flight delay compensation

### Guidance-Only Or Referral Scope

- landlord disputes without direct monetary recovery
- wage withholding or employment disputes without clear payout path
- repair enforcement or contract termination cases without direct monetary recovery
- broader consumer complaints outside the launch claim types

### Out Of Scope

- criminal defense
- divorce and family law
- immigration
- general business disputes outside defined group packages

## Product Ladder

| Offer               | Price             | Who it serves                                          | Included                                                                                                                                                                               | Human work limit        | Escalation fee                              |
| ------------------- | ----------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ------------------------------------------- |
| `Free Start`        | `EUR 0`           | Any consumer with a vehicle, property, or injury issue | eligibility check, confidence score, evidence checklist, first complaint or notice letter, timeline, next-step recommendation, email delivery of claim pack                            | none                    | not available                               |
| `Asistenca`         | `EUR 20/year`     | One adult member                                       | everything in Free Start, 24-business-hour human triage SLA, dashboard tracking, hotline routing and support, document check, complaint letters, member pricing for staff-led recovery | `2 new matters/year`    | `15%` of recovered amount, minimum `EUR 25` |
| `Asistenca+ Family` | `EUR 35/year`     | Household with up to 5 covered people                  | everything in Asistenca, family coverage, shared dashboard, household document history                                                                                                 | `5 new matters/year`    | `12%` of recovered amount, minimum `EUR 25` |
| `Group Access`      | quoted per roster | employers, unions, associations, diaspora groups       | sponsored or discounted access to the same consumer offers; no custom claim workflow in v1                                                                                             | same as underlying plan | same as underlying plan                     |

Hotline note:

- hotline means routing, urgency support, and next-step guidance
- hotline does not mean immediate legal review or full claim acceptance

## Matter Definition

`Matter` is a contractual unit for human triage and staff work.

Definition:

- one incident
- one counterparty
- one claim type
- within one 90-day resolution window

Rules:

- follow-ups, extra documents, and negotiations related to the same incident do not consume another matter
- multiple incidents are separate matters, even if the counterparty is the same
- one incident involving two claim types may create two matters if the evidence and recovery paths are materially different
- staff may merge duplicate submissions into one matter
- if a case extends beyond 90 days only because of counterparty, insurer, or court delay, it remains the same matter as long as there is no new incident and the member responds to reasonable staff requests within 30 calendar days

## SLA Definition

Interdomestik should promise a narrow, defensible SLA.

### Member SLA

- human triage response within `24 business hours` after the member submits a completed claim pack
- if the pack is incomplete, staff must send a missing-information request within `24 business hours`
- the SLA clock starts only after required minimum information is present

### Operational Notes

- `business hours` must be defined in local terms on the pricing and checkout surfaces
- hotline access does not equal full claim review; it is immediate support and routing only
- SLA applies to triage response, not to final resolution time

## Coverage Matrix

| Claim Type / Service                                                                | Free Start              | Asistenca                         | Asistenca+ Family                 | Success-Fee Escalation | Legal Partner Route |
| ----------------------------------------------------------------------------------- | ----------------------- | --------------------------------- | --------------------------------- | ---------------------- | ------------------- |
| Vehicle damage                                                                      | yes                     | yes                               | yes                               | yes                    | yes, by opt-in only |
| Property damage                                                                     | yes                     | yes                               | yes                               | yes                    | yes, by opt-in only |
| Personal injury with monetary recovery path                                         | yes                     | yes                               | yes                               | yes                    | yes, by opt-in only |
| Flight delay compensation                                                           | later phase             | later phase                       | later phase                       | later phase            | later phase         |
| Landlord, employment, repair, or contract disputes without direct monetary recovery | yes, guidance pack only | yes, guidance and document review | yes, guidance and document review | no                     | referral only       |

### Included In Membership

- self-serve claim-pack generation
- evidence checklist and document organization
- one document review per matter
- first complaint, insurer, or counterparty letter
- staff triage and case-path recommendation
- dashboard updates and SLA visibility

### Triggers Success-Fee Escalation

- insurer negotiation
- counterparty negotiation
- formal mediation
- settlement negotiation
- active recovery follow-up after staff accepts the case

### Requires Separate Written Opt-In

- court filing
- external partner-lawyer action
- expert report costs
- translations, medical opinions, or other hard costs not absorbed by Interdomestik

## Success Fee Logic

Interdomestik should use one public pricing rule for staff-led recovery:

- `No recovery, no fee.`
- success fee applies only to monetary recoveries
- fee is charged on the amount actually recovered for the member
- fee is `max(plan percentage x recovered amount, EUR 25 minimum)`

### Standard Escalation Pricing

- `Asistenca`: `15%` success fee, minimum `EUR 25`
- `Asistenca+ Family`: `12%` success fee, minimum `EUR 25`

### Legal-Action Escalation Cap

If the member explicitly authorizes external legal action:

- `Asistenca`: total fee cap increases to `25%`
- `Asistenca+ Family`: total fee cap increases to `22%`

The member must see this cap before signing the escalation agreement.

### What Counts As Recovery

- insurer payout
- negotiated settlement
- reimbursed repair cost
- recovered wage or benefit amount
- other direct monetary payment to the member

### What Does Not Count As Recovery

- sending a letter that does not result in any payment
- advisory work only
- a non-monetary outcome such as contract cancellation, repair promise, or policy correction

For non-monetary outcomes in v1, Interdomestik provides membership guidance and partner referral only.

## Escalation Acceptance Criteria

Interdomestik should not accept every matter for staff-led recovery.

Staff may accept a case for success-fee handling only if:

- the evidence meets a minimum review standard
- a plausible monetary recovery path exists
- the counterparty or insurer is identifiable
- the claim appears to be within statutory or contractual time limits
- there is no conflict of interest or integrity concern

If staff declines escalation:

- the member keeps access to membership guidance within plan limits
- the reason for decline should be categorized and shown in plain language
- a partner referral may be offered where appropriate

## Escalation Agreement

Before staff-led recovery begins, the member must sign an `Escalation Agreement`.

The agreement should include:

- confirmation that the case is accepted for staff-led recovery
- the applicable success-fee percentage and minimum fee
- the legal-action cap if external counsel becomes necessary
- the rule that hard costs require explicit pre-approval
- authorization for payment collection

### Payment Collection Order

1. deduct the success fee from payout before remittance where legally allowed
2. otherwise charge the authorized card on file
3. otherwise issue an invoice due within 7 calendar days

No staff-led escalation should start until the payment method and agreement are in place.

## Free Funnel

The free funnel should be useful, fast, and clearly self-serve.

Free Start is informational guidance only.

- the claim pack, confidence score, timeline, and templates are informational tools
- they are not legal advice
- human review starts only with membership triage or accepted staff-led escalation

### Free Start Flow

1. choose `Vehicle`, `Property`, or `Injury`
2. answer guided intake questions in about 3 minutes
3. upload optional supporting documents
4. receive:
   - `Eligibility confidence`: High, Medium, or Low
   - `Recommended next step`
   - evidence checklist
   - first complaint or notice letter
   - claim timeline
   - email copy of the full pack

### Conversion Triggers

- `Join Asistenca for human triage within 24 business hours`
- `Upgrade now if you want us to review your documents`
- `Escalate to staff-led recovery if your case has a monetary recovery path`

### Abuse Control

- pack generation stays unlimited
- human triage, document review, and staff work consume matter allowance
- terms should include a fair-use clause for repeated automated submissions

## Tier Messaging

### Free Start

Use when you want to understand your position and send the first complaint correctly.

### Asistenca

Use when you want fast human review, clearer next steps, and support for the claims that matter most.

### Asistenca+ Family

Use when one household wants shared coverage, fewer delays, and better handling capacity across multiple incidents.

## Pricing Examples

Interdomestik should show fee math in public before checkout and again before escalation:

- `EUR 600 recovered on Asistenca -> EUR 90 fee`
- `EUR 180 recovered on Asistenca -> EUR 27 fee`
- `EUR 120 recovered on Asistenca+ Family -> EUR 25 fee minimum`
- `EUR 3,000 recovered on Asistenca+ Family -> EUR 360 fee`

If legal action is required, the member should see the capped legal-action fee before opting in.

## B2B2C Package Structure

V1 group distribution should sell the existing consumer plans, not a separate enterprise product.

### Group Package Types

- `Association Bundle`: union, diaspora group, driver association, or community network pays for member access or negotiates a member discount
- `Employer Benefit`: employer funds the base plan as a benefit and employees self-upgrade to family coverage if desired
- `Partner Referral`: bank, insurer, broker, repair network, or telecom sends users into standard consumer flows

### Group Commercial Rules

- invoice annually
- import members by roster or CSV
- give each user an individual account, not a shared group account
- allow consumer self-upgrades from sponsored individual to family
- do not create custom claim handling rules per group in v1
- group invoices do not create shared access to individual claims
- group dashboards show aggregate metrics only

### Group Privacy Rule

Group admins must never see individual claim details by default.

Default group visibility:

- total activated members
- usage rates
- aggregate SLA and case counts
- no case documents, notes, or claim facts

Individual case visibility requires explicit member consent and a documented lawful basis.

## Rollout Plan

### Phase 1: Direct Consumer Launch

- ship Free Start
- ship pricing table, coverage matrix, and fee calculator
- ship escalation agreement in checkout or pre-escalation flow

### Phase 2: Operational Proof

- measure triage SLA attainment
- measure matter consumption by tier
- identify the best-performing claim category
- confirm staffing math supports `EUR 20/year` and `EUR 35/year` with the published SLA
- keep annual billing as the default v1 model unless later conversion data justifies a monthly option

### Phase 3: First Group Pilot

- sign 1 to 2 associations or diaspora groups
- use roster import and branded onboarding page
- keep reporting aggregate-only

### Phase 4: Employer Pilot

- sign 1 employer with a claims-heavy workforce
- sponsor Asistenca seats
- test self-upgrade rate into Family

## Metrics

Interdomestik should track:

- Free Start completion rate
- Free Start to membership conversion
- membership to escalation conversion
- average recovered amount by claim type
- gross margin after success-fee collection
- triage SLA attainment
- matter consumption by tier
- group activation rate
- family plan upgrade rate

## Membership Billing, Cancellation, And Refund Rules

Interdomestik should state these terms in checkout, pricing, and member settings:

- memberships are billed annually in v1
- cancellation stops renewal for the next term and does not reopen expired benefits retroactively
- any launch refund or money-back promise must be stated with a clear window and exact conditions
- any legally required cooling-off right must be stated separately from voluntary refund policy
- success-fee escalation terms survive membership cancellation for already accepted recovery matters

## Required Product Enforcement Surfaces

The commercial model is only enforceable if the product exposes the contract clearly.

### Required V1 Surfaces

- `Claim Pack Generator`: self-serve intake, disclaimer, pack output, and next-step CTA
- `SLA Clock UI`: incomplete pack versus SLA running, with published business hours
- `Matter Counter`: visible allowance for members and staff
- `Escalation Agreement`: signature, fee terms, cap, hard-cost consent, and payment authorization
- `Case Acceptance Gate`: staff accept or decline action before recovery work starts
- `Success-Fee Collection`: deduction where allowed, card charge fallback, invoice fallback
- `Group Access Controls`: roster import, aggregate-only reporting, no claim-level visibility by default

## Why This Model Fits Interdomestik

This blueprint keeps Interdomestik in the strongest part of its current model:

- agents still distribute rather than handle claims
- staff stay accountable for human review and recovery work
- members get fast, structured help without vague promises
- the success fee is tied to actual recovery work, not simple advice
- group distribution can be added without changing portal or tenancy architecture

## External Structure Borrowed

- `LegalShield`: explicit covered-service packaging and employer distribution
- `Flightright`: public fee transparency and success-fee logic
- `Resolver`: free self-serve complaint entry and structured escalation path

## Sources

- [LegalShield personal plan coverage and pricing](https://www.legalshield.com/personal-plan/coverage-and-pricing/)
- [LegalShield employer benefits](https://www.legalshield.com/resources/employee-benefits)
- [LegalShield employer portal](https://employer-benefits.legalshield.com/)
- [LegalShield about](https://www.legalshield.com/why-legalshield/about)
- [Flightright costs](https://www.flightright.com/costs)
- [Flightright FAQ](https://www.flightright.com/faq)
- [Resolver about](https://www.resolver.co.uk/about)
- [Resolver why we are free](https://www.resolver.co.uk/why-we-are-free)
- [Resolver contributions and scale data](https://www.resolver.co.uk/contributions)
