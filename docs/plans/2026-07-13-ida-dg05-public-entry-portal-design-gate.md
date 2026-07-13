---
plan_role: input
status: active
source_of_truth: false
slice: IDA-DG05
implementation_slice: IDA-UI01a
owner: platform + product + design + qa
date: 2026-07-13
last_reviewed: 2026-07-13
---

# IDA-DG05 — Single Public Entry UI Foundation Design Gate

> Status: Approved by Arben and promoted as branch-local current-authority input
> for exactly `IDA-UI01a` on `codex/interdomestik-ui-ux-foundation`.

## Gate outcome sought

This gate approves one Tier 2 presentation slice: a neutral,
problem-led public hero and action foundation on the existing `ida.*` front door.
The slice helps an anonymous visitor choose the next useful action while preserving
one brand, one login, one governed funnel, and every existing runtime boundary.

This document becomes runtime authority only through its matching canonical
`current-program.md` and `current-tracker.md` overlays. Those overlays promote
`IDA-UI01a` for this isolated UI branch; they do not mutate, reset, or supersede
the separate REC evidence worktree.

## Authority check and advisory conflict

| Source                                                             | Evidence on 2026-07-13                                                                                                  | Disposition                                                                  |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Repo `docs/plans/current-program.md` and resolver at this worktree | Pre-promotion resolution was `REC-02b`; this revision records the user-approved branch-local `IDA-UI01a` overlay.       | Authoritative for this UI branch after the matching canonical overlay lands. |
| Repo architecture program                                          | `ida.*` is the single canonical entry point; the dashboard premise is one brand and one login.                          | Binding design premise.                                                      |
| AI OS observation `a396071b...`                                    | Reported `activeSlice=none`, `runtime=not_authorized`, and session-integrity drift from a different canonical checkout. | Advisory and stale relative to this worktree; repo authority wins.           |
| This gate                                                          | Arben approved execution on 2026-07-13 after confirming the REC and UI branches may run concurrently.                   | Promotes only `IDA-UI01a` through the canonical branch overlays.             |

The REC workstream remains isolated in its own worktree and branch. This UI
branch has exactly one implementation target, `IDA-UI01a`; concurrent branch
execution does not imply concurrent merge, production exposure, or permission to
touch REC evidence files.

## Locked earlier decision: one path, not three portals

The canonical architecture decision is already made:

- `docs/plans/architecture-finalization-program-2026-05-29.md` defines `ida.*`
  as the **single canonical entry point** and requires a one-login front-door model.
- `docs/plans/2026-06-07-uiux-modernization-integration-amendments.md` requires a
  neutral, no-tenant-branding public shell before session context resolves.
- Country hosts are compatibility aliases, never identity, tenancy, entitlement,
  pricing, or separate product-entry authority.

Therefore DG-05 does not offer separate North Macedonia, diaspora, or member
portals. It defines one neutral public journey with three problem-led actions.
Diaspora, residence, payer/beneficiary, campaign, locale, and referral context may
inform later copy only; they cannot create a route, identity, tenant, entitlement,
price, case owner, or access rule.

## Primary user and outcome

- **Primary user:** an anonymous visitor who may be stressed, uncertain, or
  comparing preparedness options.
- **Entry point:** the existing localized `ida.*` landing page.
- **Exit state:** the visitor activates one real existing destination, or uses the
  persistent existing member sign-in utility.
- **Business outcome:** more visitors reach useful free value before membership is
  presented, without introducing a shadow sales, analytics, or identity system.

## One-journey action model

The hero asks what the visitor needs now. The actions are needs, not audience
segments. Candidate Albanian wording remains subject to human linguistic review.

| Need                     | Candidate SQ label                       | Existing destination | Boundary                                                                   |
| ------------------------ | ---------------------------------------- | -------------------- | -------------------------------------------------------------------------- |
| Immediate guidance       | `Më duhet ndihmë tani`                   | `/help-now`          | No eligibility, compensation, response-time, or outcome promise.           |
| Check or organize a case | `Dua ta kontrolloj ose organizoj rastin` | `#free-start-intake` | Free-start presentation only; existing intake authority remains unchanged. |
| Prepare for future needs | `Dua të jem i përgatitur`                | `/pricing`           | Membership is future preparedness, never retroactive incident cover.       |
| Existing-member utility  | `Jam anëtar — Hyr`                       | `/login`             | Existing header/mobile-menu utility; not a fourth marketing segment.       |

All four destinations exist in the current repository. The first slice adds no
new route and no dead or decorative link.

## Target experience

### First viewport

1. Existing neutral header and member sign-in remain in place.
2. One calm, direct promise explains that Interdomestik helps a visitor organize
   evidence and understand the next useful step; it does not promise legal or
   compensation outcomes.
3. `Më duhet ndihmë tani` is the single visually primary action.
4. Case check and preparedness are quieter secondary links with plain-language
   descriptions and real destinations.
5. No nationality, country, diaspora, payer, beneficiary, campaign, or referral
   choice appears as an entry gate.

### Authenticated root visit

`HomePageRuntime` already supplies `/member` and `/member/claims/new` for an
authenticated session. The future slice must preserve that precedence: a signed-in
member sees continuation of existing work, not competing public acquisition cards.

### Later presentation slices, not `IDA-UI01a`

- chosen-intent proof and document preparation;
- grouped service map;
- membership-value section refinement;
- trust/footer refinement;
- campaign/acquisition pages that converge into the same governed journey;
- dead hero cleanup or shared design-token changes.

## Promoted first slice: `IDA-UI01a`

`IDA-UI01a` is the promoted branch-local implementation identifier. Its authority
comes from this approved gate plus the matching canonical program/tracker overlay.

### Included

- Replace only the active above-fold `HeroSection` composition.
- Keep the `HeroSection` export and props contract used by both current funnel
  variants.
- Render three semantic action links for anonymous visitors; do not add tab,
  radio, carousel, or persisted selector state.
- Preserve the existing authenticated-member CTA precedence.
- Remove the simulated member card, `4.9`, member-count, `100%`, 24-hour, and
  guarantee-style proof from the active hero unless signed evidence is separately
  accepted before implementation.
- Add complete copy for all canonical locales: `sq`, `en`, `sr`, and `mk`.
- Add focused render, translation, keyboard, responsive, and browser proof.

### Excluded

- Below-the-fold homepage redesign.
- Header/navigation redesign or language-control work.
- Campaign pages, diaspora landing pages, gift membership, payer/beneficiary
  flows, sales attribution, referrals, commissions, or finance reporting.
- New analytics events, providers, cookies, consent writes, or durable selection.
- New backend calls, persistence, database, schema, RLS, storage, auth/session,
  tenant, routing, proxy, Paddle, pricing, production alias, or canonical-route
  behavior.
- `hero-v2.tsx` deletion or resurrection.

## Rendered path and file plan

The current rendered path is verified as:

```text
apps/web/src/app/[locale]/page.tsx
  ├─ UI V2 → HomePageRuntime → HeroSection
  └─ UI V1 → HeroSection
```

`hero-v2.tsx` has no runtime importer. Its useful ideas may inform copy, but the
file must remain unreferenced and untouched in `IDA-UI01a`.

| File                                                                      | Planned action after promotion                                                  | Constraint                                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/web/src/app/[locale]/components/home/hero-section.tsx`              | Reduce the current 220-line component to a focused server composition.          | Must finish at or below 150 lines.                                          |
| `apps/web/src/app/[locale]/components/home/public-entry-actions.tsx`      | New semantic list of real links and descriptions.                               | Server component, no local storage/cookie/URL state, at or below 150 lines. |
| `apps/web/src/messages/{sq,en,sr,mk}/hero.json`                           | Add equivalent, protective action copy in every canonical locale.               | Human linguistic review required; no silent English fallback.               |
| `apps/web/src/app/[locale]/components/home/hero-section.test.tsx`         | Replace claim-heavy assertions with anonymous and authenticated contract proof. | Keep concise; extract fixtures if the test approaches 200 lines.            |
| `apps/web/src/app/[locale]/components/home/public-entry-actions.test.tsx` | Assert roles, names, hrefs, hierarchy, and forbidden claims.                    | Test-first RED proof before component creation.                             |
| `apps/web/e2e/public-entry-hero.spec.ts`                                  | Add locale, keyboard, responsive, overflow, and screenshot evidence.            | No Playwright config or shared gate-infrastructure change.                  |

Explicitly unchanged in the first slice:

- `apps/web/src/app/[locale]/page.tsx`;
- `apps/web/src/app/[locale]/components/home/home-page-runtime.tsx`;
- `apps/web/src/app/[locale]/components/home/header.tsx`;
- `apps/web/src/app/[locale]/components/home/hero-v2.tsx`;
- `apps/web/src/proxy.ts` and all protected runtime surfaces.

## Funnel and instrumentation contract

- Preserve `data-testid="landing-page-ready"` and `data-testid="page-ready"`.
- Preserve `data-experiment="home-funnel"`.
- Preserve the live `hero_v1` / `hero_v2` `data-variant` values and their current
  meaning. The first slice does not rename, remove, reinterpret, or emit a new
  variant.
- New presentation test IDs may be limited to:
  `public-entry-hero`, `public-entry-help-now`, `public-entry-case-check`, and
  `public-entry-membership`.
- `IDA-UI01a` emits no new analytics event and writes no attribution record.
  A later analytics slice would require consent, event-dictionary, provider, and
  reporting authority of its own.

## Copy-claim ledger

No quantitative or guarantee claim is approved for the first hero. Current hero
phrases are implementation evidence of what must be removed from this surface,
not evidence that the claims are true.

| Current hero concept                              | First-slice disposition          | Evidence required to restore later                                           |
| ------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------- |
| `4.9` rating / top-rated support                  | Remove.                          | Signed source, sample, date, owner, and publication approval.                |
| `8,500+` active members                           | Remove.                          | Authoritative membership count, as-of date, owner, and refresh rule.         |
| `100%` legal protection / guaranteed service      | Remove.                          | Approved legal scope, entity, exclusions, terms, and claim owner.            |
| 24-hour / 24-7 response or opening                | Remove.                          | Approved SLA, operating coverage, monitoring, exception handling, and owner. |
| Instant digital card / wallet readiness           | Remove simulated card from hero. | Live product capability and browser/device proof.                            |
| Compensation, refund, no-fee, or outcome language | Do not introduce.                | Signed fee/terms authority and legal/commercial approval.                    |

Allowed first-slice language describes guidance, organization, evidence, next
steps, existing free start, and existing membership information without promising
eligibility, coverage, response time, professional acceptance, or outcome.

## Accessibility and interaction contract

The first slice deliberately uses links rather than a stateful selector. That
removes ambiguous selected-state semantics and keeps the smallest implementation
native to the browser.

- one `h1`, descriptive text, and a semantic list of three links;
- unique accessible names that describe destination and purpose;
- DOM and visual order match: urgent help, case check, preparedness;
- minimum 44 by 44 CSS-pixel hit targets;
- visible `:focus-visible` treatment using existing ring tokens;
- complete keyboard operation with Tab, Shift+Tab, Enter, and no focus trap;
- no color-only urgency or selection cue;
- no auto-rotation, carousel, or essential motion;
- `prefers-reduced-motion` produces no lost content or interaction;
- WCAG AA contrast for normal and large text;
- usable at 200% zoom and without horizontal overflow.

## Visual and responsive contract

Direction remains **calm premium utility**, implemented with the existing semantic
token set. The first slice does not change shared tokens or introduce a new font.

- ink/foreground text on background/card surfaces;
- restrained existing primary/accent use;
- clear borders, modest radius and elevation;
- no glassmorphism, decorative gradient field, fake dashboard card, emoji icon,
  trauma imagery, or unsupported trust badge;
- one visually dominant urgent action per viewport.

Canonical evidence widths are `375`, `390`, `768`, `1024`, and `1440` CSS pixels.
Automated layout assertions cover all five; durable screenshots are required at
375, 390, and 1440, including the longest approved non-SQ copy.

## Translation evidence

- Add the same new hero keys to `sq`, `en`, `sr`, and `mk`.
- Add a focused key-parity/non-empty test for the new public-entry copy because
  the broad legacy i18n test proves EN/SQ parity but does not fully prove hero
  parity for SR/MK.
- Run `pnpm i18n:check` and `pnpm i18n:purity:check`.
- Browser-check all four locales for visible copy, correct hrefs, truncation,
  overflow, and accessible names.
- Human linguistic review is required before promotion or merge; generated copy
  alone is not approval.

## Acceptance evidence inventory

| Criterion                                          | Durable proof                                                                                              | What it does not prove                          |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| One neutral entry, not geography/audience portals  | Render tests assert problem-led labels and absence of country/diaspora gates.                              | Routing or tenant isolation by itself.          |
| Every action is truthful and operable              | Render tests assert exact hrefs; Playwright activates all links.                                           | Eligibility, coverage, or service outcome.      |
| Existing member work remains primary               | `HomePageRuntime` regression plus signed-in hero render test preserves `/member` and `/member/claims/new`. | Any auth/session change; none is authorized.    |
| Variant and clarity-marker contracts remain stable | Page/unit and existing funnel E2E assert markers and `hero_v1`/`hero_v2`.                                  | Analytics event completeness.                   |
| Four locales are complete                          | Focused SQ/EN/SR/MK key-parity test plus i18n checks and locale browser loop.                              | Legal approval of copy.                         |
| Mobile and zoom are usable                         | Playwright at 375/390 plus 200% zoom and overflow assertions.                                              | Every physical device/browser.                  |
| Keyboard and screen-reader structure are sound     | Role/name assertions, keyboard traversal, and Playwright accessibility snapshot.                           | Full manual assistive-technology certification. |
| Claims are protective                              | Forbidden-claim render assertions plus manual claim-ledger review.                                         | Truth of any below-the-fold legacy claim.       |

There is no durable store, event, audit row, provider state, fixture mutation, or
external side effect required to prove this presentation slice. Screenshots,
traces, test reports, and reviewer receipts are evidence artifacts only.

## Browser evidence plan

Use Playwright MCP first against the promoted implementation preview. If it is
unavailable, record the exact MCP error before using the repo Playwright lane.

1. Anonymous `ida.*` load has `landing-page-ready`, no tenant chooser, and no
   tenant cookie.
2. For `sq`, `en`, `sr`, and `mk`, assert heading, three accessible action links,
   and exact localized destinations.
3. Traverse the header utility and all hero actions with keyboard only.
4. At 375/390/768/1024/1440, assert no horizontal overflow or clipped focus ring.
5. Capture 375 SQ, 390 longest non-SQ, and 1440 EN screenshots with reduced motion.
6. Capture an accessibility snapshot and record heading/link order and names.
7. Re-run existing front-door session-context and funnel-continuity specs.

## Test-first execution plan after promotion

1. **Authority preflight:** consult AI OS, then confirm repo current authority
   promotes exactly `IDA-UI01a`; stop on any mismatch.
2. **RED contract tests:** add failing anonymous-action, authenticated-precedence,
   four-locale parity, forbidden-claim, and marker/variant assertions.
3. **Minimal presentation implementation:** split `HeroSection`, add the semantic
   action component, and update all four locale files without touching excluded
   surfaces.
4. **Focused GREEN proof:** run component tests, i18n checks, modularity guard,
   and the focused public-entry browser spec.
5. **Browser evidence:** use Playwright MCP for responsive, keyboard, reduced-motion,
   zoom, accessibility-tree, and screenshot evidence.
6. **Independent review:** product/UX/accessibility, QA/E2E, architecture/scope,
   and security-boundary reviewers inspect the bounded diff.
7. **Final Phase C gates:** run `pnpm pr:verify`, `pnpm security:guard`, and
   `pnpm e2e:gate`; no PR or merge claim before all applicable evidence is green.

## Reviewer matrix for the promoted slice

| Focus                      | Repo role / route                | Required result                                                       |
| -------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| Product, copy, one-path UX | `pixel` + human product owner    | Problem-led hierarchy and claim ledger accepted.                      |
| Accessibility and mobile   | `qa_reviewer` + Playwright MCP   | Keyboard, names, focus, zoom, responsive proof green.                 |
| Architecture and scope     | `architect_reviewer` / `atlas`   | No route, host, auth, tenant, billing, or dead-hero creep.            |
| Security boundary          | `security_reviewer` / `sentinel` | Diff confirms presentation-only scope and no new provider/data write. |
| Maintainability            | senior reviewer                  | Files respect modularity and server/client boundaries.                |
| Gate decision              | `gatekeeper`                     | Focused proof and mandatory Phase C gates green.                      |

## Design-review evidence and disposition

### Prior Fable/Codex advisory

The vault advisory `2026-07-13-interdomestik-entry-commercial-design-fable-codex-debate`
recommended one governed neutral front door, problem-led intents, B-first/C-target,
the verified live `HeroSection` path, explicit variant-label handling, protective
copy, and modular primitives. Fable's first rebuttal attempt hit a session-limit
blocker; the bounded rerun completed in 99.093 seconds. The advisory is not repo
authority, but its relevant findings are accepted here.

### Opus 4.8 bounded gate review

- Route: repository-owned `pnpm review:opus`.
- Provider/model: Anthropic / `claude-opus-4-8`.
- Status: `ran`; started `2026-07-13T15:29:48.687Z`; ended
  `2026-07-13T15:31:10.729Z`; elapsed `82.042s`; exit `0`.
- Timeouts: first-output `false` at 300 seconds; total `false` at 900 seconds.
- Verdict: **ACCEPT WITH CONDITIONS**.
- Provider blocker: none. One earlier local shell-quoting invocation was discarded
  before it could count as review evidence; it was not a provider failure or verdict.

| Finding                                       | Disposition in this revision                                                             |
| --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| B1: SR omitted                                | Accepted: all canonical locales are now SQ/EN/SR/MK.                                     |
| B2: live target and variant semantics unnamed | Accepted: render path, dead `hero-v2.tsx`, and stable live labels are explicit.          |
| H1: first slice too broad                     | Accepted: `IDA-UI01a` is hero/actions only; later sections are deferred.                 |
| H2/H5: protection and country framing         | Accepted: geography/audience gates and coverage phrasing are removed.                    |
| H3: no destination map                        | Accepted: every action maps to one existing destination.                                 |
| H4: selected-state semantics unclear          | Accepted by simplification: the first slice uses native links and has no selected state. |
| O1: inconsistent widths                       | Accepted: one five-width evidence matrix is defined.                                     |
| O2: conversational reviewer metadata          | Accepted: durable route evidence replaces conversational wording.                        |

## Risks, mitigations, and residual limits

| Risk                                                      | Mitigation                                                                     |
| --------------------------------------------------------- | ------------------------------------------------------------------------------ |
| UI becomes a geography or diaspora gate                   | Use needs only; assert forbidden audience labels; no state persists.           |
| Urgent help is displaced by membership selling            | Keep Help Now visually primary; membership remains preparedness and secondary. |
| Copy implies insurance, eligibility, coverage, or outcome | Remove unsupported hero claims and enforce the claim ledger.                   |
| Dead hero is accidentally revived                         | Pin the verified render path and forbid `hero-v2.tsx` changes.                 |
| Funnel analytics semantics drift                          | Preserve markers and live variant values; emit no new event.                   |
| Locale rollout silently drops SR/MK                       | Four-locale parity test, browser loop, and human review.                       |
| Presentation slice grows into shared design-system work   | Use existing tokens and route-local components only.                           |
| Signed-in member sees acquisition competition             | Preserve existing member/member-new-claim CTA precedence in tests.             |

Residual risks after the first slice:

- below-the-fold legacy marketing claims remain outside this narrow slice;
- browser proof is representative, not certification across every assistive
  technology and physical device;
- human legal/commercial and linguistic approval remains necessary for publishable
  copy;
- no conversion conclusion is possible because the slice adds no new measurement.

## Explicit non-goals

- Separate country, diaspora, campaign, or member portals.
- Host-, locale-, geo-, referral-, campaign-, or selector-derived authority.
- A service catalog redesign, full homepage redesign, member dashboard redesign,
  or campaign-template rollout.
- New accounts, roles, auth, onboarding, tenant selection, data writes, analytics,
  consent, storage, claims, billing, Paddle, pricing, or legal automation.
- Pricing/fee guarantees, compensation scoring, eligibility automation, medical or
  injury categorization, or legal-outcome promises.
- Changes to `proxy.ts`, canonical routes, production aliases, README, AGENTS,
  or architecture docs. After this promotion record, the runtime slice must not
  make additional current-program or current-tracker changes before closeout.

## Promotion and stop conditions

Promotion evidence, in order:

1. **Complete:** Arben explicitly approved execution in this task on 2026-07-13.
2. **Complete for implementation:** unsupported quantitative, guarantee, coverage,
   fee, eligibility, and outcome claims remain prohibited by the claim ledger.
   Human linguistic sign-off for the final SQ/EN/SR/MK wording remains a merge gate.
3. **Complete on this branch:** canonical current authority names exactly
   `IDA-UI01a`; the REC workstream remains isolated on its own branch/worktree.
4. **Complete:** fresh AI OS observation `a396071b...` was reconciled as advisory
   drift; branch-local repo authority remains controlling.
5. **Required next:** test-first implementation on the authorized branch only.

Stop and return to design/current authority if implementation would require:

- any protected or explicitly excluded surface;
- a new route, analytics event/provider, persisted selection, cookie, or data write;
- country/diaspora/campaign/referral-derived behavior;
- an unsupported claim or unreviewed locale;
- shared token, header, page-shell, Playwright-config, or gate-infrastructure change;
- a file-scope expansion beyond the named presentation components and evidence.

## Gate status

**Approved and promoted for branch-local implementation of exactly `IDA-UI01a`.**
Merge readiness still requires human linguistic disposition, bounded independent
implementation review, browser/accessibility evidence, and all applicable Phase C
gates. No other runtime slice or protected surface is authorized here.
