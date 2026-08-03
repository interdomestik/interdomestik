# IDA-DG22 Accessibility Overflow Attribution Addendum

Status: proposed; exact-byte user approval and canonical merge required before implementation

Addendum ID: `IDA-DG22-A3`

Parent gate: `IDA-DG22`

Parent gate SHA-256:
`baf97ad76a21df381b806403dc50d2b477637e1e58c45c4ca2e16708113ab4a8`

Prior addendum: `IDA-DG22-A2` R2

Prior addendum SHA-256:
`ebf579a54fb8bb3eec640d12d07b4f74c558ae6ce38a9b48047dd7abe4f0483a`

Sole implementation slice: `IDA-UI03a4`

Classification: design-gate evidence correction for the existing Tier-3 privacy-sensitive UI slice

Authority base: `7cc5149c0fc4cc0b2ce26af6d5c3091d2fa25b15`

Runtime authorized by this docs-only addendum: `false`

## Decision

Correct the attribution boundary of the parent gate's responsive no-overflow evidence. At literal
320, 360, 390 and 430 CSS layout viewport pixels with CSS `zoom:2` presentation and the required
text spacing, the recovery region and its actions must:

1. reflow without clipping;
2. remain entirely inside the CSS layout viewport;
3. have no internal horizontal overflow;
4. render each action at least 44 unscaled CSS pixels in both dimensions;
5. preserve keyboard reachability and visible focus; and
6. create no new or increased document-level horizontal overflow compared with the same exact
   page, locale, cookie state, media, viewport and presentation before a recovery offer exists.

This addendum explicitly supersedes only the parent gate's absolute page-level no-document-overflow
clause for `IDA-UI03a4`. That global criterion is observed unmet and deferred, not passed or
waived. The replacement same-page attribution contract is mandatory for this slice. The
implementation may not hide document overflow with a global `overflow-x` rule, weaken
button/region bounds, remove forced-color or text-spacing proof, or treat an increase smaller than
a tolerance as acceptable.

The public page already has document-level horizontal overflow under this exact presentation when
the anonymous recovery record and offer are absent. The existing public header actions are the
first un-clipped contributor. That separate page-wide defect is outside the cumulative 19-path
writer map and the sole recovery outcome. It must be retained as an explicit unpromoted
current-authority candidate for the remaining UI journey tree. This addendum does not assign it a
slice ID, promote it, authorize its implementation, or claim that the global page is overflow-free.

The parent wording “actions reflow without clipping or horizontal document overflow” and the
absolute no-overflow portion of parent acceptance criterion 16 are amended to recovery-owned
causality: recovery actions must be internally overflow-free and must not introduce or increase
document overflow over the exact no-offer baseline. Every named keyboard, initial no-focus-steal,
visible-focus, accessible-name, literal CSS width, zoom/text-spacing, target-size, reduced-motion
and forced-colors requirement remains mandatory.

## Failure evidence and classification

The last valid implementation checkpoint before this addendum is remote clean head
`c17d9e063dba0fa2b3b994421e40f5888bc1960d` on PR `#1473`. Its product runtime is unchanged from
`2d3e3b3f5cb2c181005c574266a5b2f32da4e971`; later commits modify only the existing recovery E2E
spec and deterministic repository-size metadata.

The exact Z620 production build at runtime head `2d3e3b3f5cb2c181005c574266a5b2f32da4e971`
compiled, type-checked, generated 70/70 static pages and synchronized 114 manifests plus 122
aliases. The current test head exercised that content-equivalent runtime on the exclusive
`interdomestik-z620-staging` runner.

The first absolute document predicate used the literal parent contract: a 320 CSS-pixel Playwright
layout viewport plus CSS `zoom:2`. It failed because the whole public page already overflows in
that presentation. Test-only head `c17d9e063dba0fa2b3b994421e40f5888bc1960d` then incorrectly
treated a 640 CSS-pixel Playwright viewport as a physical viewport that became 320 CSS pixels after
zoom. Playwright viewport width is already CSS layout width, and CSS zoom does not change
responsive media-query identity. That attempted correction is invalid and remains non-merge-ready.

A bounded exact-browser probe restored the literal 320 CSS-pixel layout viewport, asserted
`innerWidth=320`, `(max-width: 320px)=true` and `(min-width: 321px)=false`, then applied
CSS `zoom:2` plus the required text spacing. It produced:

- with a valid recovery offer: document `clientWidth=320`, `scrollWidth=760`;
- recovery region bounds: `left=20`, `right=276`, `clientWidth=126`, `scrollWidth=126`;
- recovery actions: `left=54`, maximum `right=269.59375`, unscaled heights `84`, with no internal
  overflow;
- with local recovery removed and no offer: document `clientWidth=320`, `scrollWidth=760`;
- cookie banner absent in both states;
- existing no-offer public-header actions: `left=451.6875`, `right=760.28125`.

The identical `760` document width with and without the recovery offer proves that the recovery
region does not create or increase this baseline overflow. The header is outside the 19-path
writer map. Fixing it here would require a twentieth repository path, widen the product outcome,
and violate the parent stop condition and one-slice goal.

Classification:

- `workflow/gate` plus `authority evidence gap`: the first literal-width test used an absolute
  whole-page predicate that cannot attribute the unchanged baseline to the recovery slice;
- `workflow/gate`: test-only head `c17d9e063…` incorrectly reinterpreted the 320 CSS-pixel
  requirement through a 640 CSS-pixel layout viewport;
- `pre-existing product/accessibility defect outside current authority`: the public header causes
  page-wide overflow at the exact presentation even when no recovery record or UI exists.

### Content-addressed attribution probe receipt

This receipt is part of the exact-byte A3 artifact and is therefore content-addressed by A3's
final SHA-256. It was collected on 2026-07-29 with the repository Playwright CLI controlling
Chromium on Mac through a task-only SSH tunnel to the already-running exact Z620 production build:

- implementation/test head: `c17d9e063dba0fa2b3b994421e40f5888bc1960d`;
- product runtime/build head: `2d3e3b3f5cb2c181005c574266a5b2f32da4e971`;
- URL: `http://ida.localhost:3107/en`;
- viewport: `320 × 720` Playwright CSS layout pixels;
- presentation: CSS `zoom:2`, required line/letter/word spacing, loaded fonts and two settled
  animation frames;
- state sequence: necessary-only cookie; key removed; reload; wait for enabled recovery and
  non-inert editor; measure no-offer baseline; enter eligible facts; wait for the recovery key;
  reload; wait for visible offer and inert editor; measure offer state.

Exact returned values:

In this receipt, `root` is `document.documentElement`; its `client` and `scroll` values are
`clientWidth` and `scrollWidth`.

```json
{
  "baseline": {
    "keyPresent": false,
    "offerVisible": false,
    "saveBehavior": "device-recovery",
    "editorInert": false,
    "innerWidth": 320,
    "media320": true,
    "media321": false,
    "root": { "client": 320, "scroll": 760 },
    "headerActions": { "left": 451.6875, "right": 760.28125 }
  },
  "offered": {
    "keyPresent": true,
    "offerVisible": true,
    "saveBehavior": "device-recovery",
    "editorInert": true,
    "innerWidth": 320,
    "media320": true,
    "media321": false,
    "root": { "client": 320, "scroll": 760 },
    "offer": {
      "left": 20,
      "right": 276,
      "clientWidth": 126,
      "scrollWidth": 126
    },
    "buttons": [
      { "left": 54, "right": 269.59375, "clientWidth": 108, "clientHeight": 84 },
      { "left": 54, "right": 250.40625, "clientWidth": 96, "clientHeight": 84 }
    ]
  }
}
```

The diagnostic browser is supporting evidence only. The amended spec must reproduce the contract
on the exclusive Z620 browser lane and later in the exact A2 trustworthy-origin Chromium, Firefox
and WebKit matrix before merge.

No runtime code edit is authorized or required by this addendum. Product, privacy, storage,
multi-tab, secure-save, locale and copy checkpoints remain frozen. Only the accessibility
assertion and downstream evidence on the resulting head are invalidated.

## Exact amended browser proof

The already-authorized
`apps/web/e2e/gate/premium-free-start-recovery.spec.ts` must perform the proof in this order:

1. open the exact neutral-IDA public organizer with the necessary-only cookie state and no
   anonymous recovery record;
2. before measuring, prove the recovery key is absent, the offer is absent, the organizer reports
   `data-save-behavior="device-recovery"`, and `free-start-recovery-editor` is not inert; these
   observations bind the baseline to completed recovery initialization rather than the first
   visible shell paint;
3. enable the required forced-colors and reduced-motion presentation;
4. for CSS layout viewport widths 320, 360, 390 and 430, set the Playwright viewport to that exact
   width, apply and confirm the complete presentation including CSS `zoom:2`, text spacing and
   media, then await `document.fonts.ready` and two successive `requestAnimationFrame` callbacks;
5. after that settle, assert `innerWidth` plus matching `max-width`/next-pixel `min-width`
   media-query identity before recording `document.documentElement.clientWidth` and
   `document.documentElement.scrollWidth`;
6. remove only the test presentation, enter the existing privacy-transition facts, write one
   eligible vehicle recovery record and reload into the recovery offer;
7. prove the organizer still reports `data-save-behavior="device-recovery"`, the recovery offer is
   visible, and `free-start-recovery-editor` is inert before measuring the offer state;
8. before any programmatic focus call, prove initial discovery did not move focus into the
   recovery offer and that `document.activeElement` remains the expected body/default page target;
9. for every offer-state width, repeat the exact order from the baseline: set the literal viewport,
   apply and confirm the complete zoom/text-spacing/media presentation, await fonts and two frames,
   assert media identity, then measure;
10. at each width, prove the recovery region and both actions are fully inside the viewport and
    have `scrollWidth <= clientWidth`, and prove each action's unscaled `clientWidth` and
    `clientHeight` are at least 44 CSS pixels;
11. prove the document `clientWidth` matches its baseline and the offer-state document
    `scrollWidth` is no greater than the exact no-offer baseline;
12. retain programmatic name, keyboard order, visible-focus, minimum target-size, deliberate
    resume, forced-colors and reduced-motion assertions.

The baseline must come from the same page instance and runtime before the recovery record is
created. Both measurements must use loaded fonts and settled layout; a font-cache race, different
font readiness, 2× substituted viewport, hard-coded width, screenshot-only comparison, tolerance,
global overflow suppression, element hiding, or baseline from a different route/locale/host/build
does not satisfy this proof.

The test must remain within its existing 150-line ceiling. Deterministic
`scripts/repo-size-budget.json` synchronization is allowed only because it is already writer-map
path 17. The cumulative implementation ceiling remains exactly 19 paths; no new runtime or test
path is added.

Focused evidence invalidated by this addendum:

```bash
pnpm --filter @interdomestik/web exec playwright test \
  e2e/gate/premium-free-start-recovery.spec.ts \
  --project=gate-ks-sq --workers=1 --retries=0 \
  --grep "keeps recovery controls usable"
pnpm repo:size:check
pnpm format:check
pnpm lint
pnpm check:modularity-guard
git diff --check
```

After that focused proof passes, the existing trustworthy-origin Chromium, Firefox and WebKit
recovery spec must rerun once because the spec head changed. The exact production build need not
repeat while the runtime source remains content-equivalent to the already-passed
`2d3e3b3f5cb2c181005c574266a5b2f32da4e971` build.

The parent mandatory Phase C proof remains unchanged:

```bash
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

Codex Security diff scan remains explicitly waived by user instruction. Gitleaks, CodeQL,
`pnpm audit`, Sonar, repo-native security evidence, current-head reviewers, unresolved-thread
count zero and `pr-finalizer` remain required.

## Writer ceiling, forbidden surfaces and remaining UI tree

This addendum adds no implementation writer. The cumulative ceiling remains the 19 paths from
`IDA-DG22`, `IDA-DG22-A1` and `IDA-DG22-A2`.

All prior forbidden surfaces and non-goals remain exact. In particular this addendum does not
authorize:

- the public header, navigation, language selector, login action, decorative sections, global
  layout, CSS reset or any page-wide overflow suppression;
- `apps/web/src/proxy.ts`, routes, page-ready markers, auth, session, tenancy, schema, RLS,
  database, billing, membership, claims, providers, deployment, runners or production behavior;
- a twentieth path, new dependency, visual redesign or second product slice;
- `IDA-UI03a2`, `IDA-UI03b`, `IDA-UI03a0c`, `IDA-UI05a`, PR `#1455`,
  `IDA-CD-DG02` or `IDA-CD02`.

Canonical closeout for `IDA-UI03a4` must record the observed public-header/document-overflow
defect as an unresolved, unpromoted UI-tree candidate. A later current-authority selection must
score and either promote or explicitly defer it alongside the other remaining journey nodes. It
must not be silently treated as fixed, waived, completed or authorized by this addendum.

## Review, rollout and rollback

Claude Opus quota is exhausted. Per Arben's instruction, GPT-5.6 Sol Ultra is the required senior
route for the exact addendum and the final implementation diff. Review must confirm that the new
comparison proves recovery-owned no-regression without masking the global baseline, that all four
literal CSS layout viewport widths are collected with matching responsive media-query identity,
and that no production or unauthorized path is required.

Model review remains advisory and does not replace repository checks, Sonar, CodeQL, security,
review threads, finalizer or merge authority.

This docs-only addendum changes no runner allocation. Mac remains operator/editing/light-proof
authority, GitHub-hosted Ubuntu remains lightweight production evidence, and exclusive
`interdomestik-z620-staging` remains the exact browser-heavy lane. No production execution moves
to Z620.

Rollback before implementation is a docs-only revert. After implementation begins, the exact A3
assertion rollback target is `c17d9e063dba0fa2b3b994421e40f5888bc1960d`. That checkpoint
contains the known non-attributable absolute document predicate, so rollback deliberately returns
the slice to a stopped, non-merge-ready state and invalidates every A3 focused and three-browser
receipt. Product runtime remains content-equivalent to
`2d3e3b3f5cb2c181005c574266a5b2f32da4e971`; no browser record, server state, deployment,
provider or user data changes. A rollback may not claim the global overflow is resolved.

## Runtime rebind and stop conditions

Implementation may resume only after:

1. Arben approves the exact addendum bytes and SHA-256;
2. this docs-only authority PR passes focused checks and senior review, then merges on canonical
   main;
3. AI OS/Brain refresh and resolver still select only `IDA-UI03a4`; and
4. a fresh runtime receipt binds this exact addendum, the same 19-path ceiling and the preserved
   product runtime checkpoint.

Stop before implementation merge if:

- the recovery region or either action clips, overflows internally or leaves the viewport at any
  required width;
- `innerWidth` or the paired media queries do not prove the exact required CSS layout viewport;
- a 2× viewport or other “effective-width” substitution replaces the literal CSS width contract;
- either action measures below 44 unscaled CSS pixels in width or height;
- initial recovery discovery moves focus into the offer before deliberate keyboard interaction;
- offer-state document overflow exceeds the exact no-offer baseline;
- baseline recovery initialization is not proven by absent key/offer, enabled device recovery and
  a non-inert editor, or the offer state is not proven by a visible offer and inert editor;
- either baseline or offer measurement occurs before fonts and the two-frame layout settle;
- the baseline is hard-coded, taken from a different environment, or hidden with global CSS;
- the fix requires a public-header/global-layout edit, twentieth path or second slice;
- the future page-wide overflow candidate is omitted or falsely marked completed;
- exact-current focused, cross-browser, reviewer, Sonar, CodeQL, security or finalizer evidence is
  not valid.

This addendum preserves every valid checkpoint, corrects only attribution of the accessibility
evidence, keeps the global defect visible for the remaining UI tree, and does not restart
verification or promote a second slice.
