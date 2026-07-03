# Interdomestik IDA — Mobile Experience Blueprint — Part 4

> Status: **Design input — no implementation authority.**

Part 4 of [mobile-experience-blueprint.md](./mobile-experience-blueprint.md).

## 15. Risks & Open Business Questions

1. **POA / assignment validity per country.** E-signature (draw/OTP) may not satisfy POA formality in every target jurisdiction (notarization requirements). Need a per-country legal matrix before the Agreement Ceremony ships; fallback = print-and-sign with in-app tracking. _Owner: legal. Blocks Wave 3._
2. **Medical data (GDPR Art. 9).** Injury pre-check processes special-category data. The consent sheet is necessary but not sufficient — need DPIA, retention rules, and reviewer-access logging before injury intake goes public. _Blocks injury path, not car/property._
3. **Cession vs. POA default in VONESA per airline/jurisdiction** — some airlines reject assignment; the fallback switch must be case-level, and the fee math may differ. Confirm with the recovery partner.
4. **24h human-review SLA capacity.** The read-back screen promises specialist confirmation in 24h. If review staffing can't hold that at launch volume, soften to "within 1 business day" _before_ launch — a broken trust promise in week one is unrecoverable.
5. **Success-fee display vs. regulation.** Displaying fee math as quasi-financial projection may attract consumer-credit/claims-management regulation in some markets. Verify wording ("example," not "estimate") per country.
6. **Sponsor privacy boundary** is a contractual promise, not just UI — sponsor agreements must mirror the "aggregate only" rule, and the API must enforce it (no individual endpoints for sponsor-admin role, period).
7. **App store vs. PWA.** Recommendation: ship as installable PWA for pilot markets _plus_ store-wrapped build (Capacitor-class) for launch — store presence is a trust signal in the Balkans' consumer market; PWA alone under-converts. Decide by Wave 2.
8. **Agent cash sales** (street sales culture) vs. Paddle-only rails — the "cash-marked" activation needs a reconciliation process or it becomes a fraud vector.
9. **Free Claim Pack cannibalization?** Bet: no — the pack converts skeptics and the people who only ever wanted the form were never buyers. Measure pack→member conversion; if <3% after 90 days, gate the letter template (not the checklist).
10. **Family/household abuse** (one Familja plan shared beyond household) — accept at launch, monitor case-per-plan ratio.
11. **Gift-membership privacy boundary (diaspora payer vs. beneficiary).** The payer must see renewal/payment only — never case existence or content. Same enforcement rule as sponsors: no API surface, not just no UI. Also verify Paddle supports payer-country billing with beneficiary-country service delivery (tax/invoice implications).
12. **Cross-border case economics.** Foreign-insurer recovery (esp. DE/CH counterparties) has different cost structures and may need in-country partners; confirm the success-fee % holds before marketing the cross-border promise to diaspora.

---

## 16. Final Design Review Checklist

Ship-gate for every member-facing release:

- [ ] Every case, in every state, shows exactly one Next Step with an owner and a date.
- [ ] Help Now reachable in one tap from every screen; car-accident guide works in airplane mode.
- [ ] First useful output (checklist or eligibility read) reachable in <30s from cold install, no account.
- [ ] No automated output presented as final: every pre-check carries the `ReviewBadge`; bands + reasons, never bare scores.
- [ ] Fee math shown _before_ every signature; "recover nothing → pay nothing" present at every agreement moment.
- [ ] No PII collected in the Free Zone before the fork screen; medical questions always preceded by the Consent Sheet.
- [ ] POA/agreement full text accessible within one tap of every summary; signed copies land in Vault immediately.
- [ ] Sponsor-admin role has no route, API, or export exposing individual case data.
- [ ] All status copy is a full localized human sentence (sq/mk/en), no concatenated fragments, no internal status codes visible.
- [ ] Push notifications deep-link to the Next Step card and render meaningfully when the app is opened cold.
- [ ] Amber appears only where the member must act; if a screen has two amber elements, the screen is wrong.
- [ ] Every escalation (expert/court/lawyer) is a staff-proposed card with explicit approval — none self-serve, none automatic.
- [ ] Accessibility: 17pt+ body in stress flows, ≥44pt targets, full flows with VoiceOver/TalkBack, contrast AA.
- [ ] A member who does nothing for 30 days receives at most one meaningful notification — silence discipline is a trust feature.

---

_The one-line thesis: stop selling eleven services; sell one promise — "something happened, we'll take it from here" — and let the case spine, the Next Step invariant, and honest fee math do the trust-building that disclaimers never will._
