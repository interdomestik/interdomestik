# Design Appendix 5: Errors, Accessibility, And Verification

[Back to the canonical design index](../2026-07-09-review-evidence-console-design.md)

## Error And Edge States

The app must handle:

- missing or malformed packet JSON with a clear unavailable-packet screen;
- an unknown packet or item ID without crashing;
- incompatible stored drafts without deletion;
- corrupt stored drafts with recovery download and explicit deletion;
- a newer draft written by another tab;
- local storage quota or write failures with retry and export options;
- incomplete items with inline messages and a grouped summary;
- network loss without blocking local work;
- duplicate submit actions by disabling the action during receipt generation;
- correction attempts without a prior receipt;
- receipt imports with schema, hash, packet, size, or field-validation failures;
- local receipt files larger than 1 MiB or with a non-JSON extension;
- empty inbox state;
- narrow viewports and 200% text zoom;
- reduced-motion preference;
- an unavailable download path with a copyable receipt fallback.

## Accessibility

The console targets WCAG 2.2 AA behavior.

- semantic landmarks and heading order;
- native form controls and explicit labels;
- full keyboard access;
- visible focus indicators;
- 44px minimum mobile targets;
- status labels that do not rely on color;
- live regions for autosave and submission states;
- focus management after validation and view changes;
- no horizontal table required for the core flow;
- reduced-motion support;
- layouts that remain usable at 320px width and 200% zoom.

## Verification

### Unit Proof

Node tests cover:

- explicit-decision requirements;
- conditional requested-change rules;
- packet completion;
- deterministic receipt IDs and receipt content;
- correction version linkage;
- draft normalization;
- storage failure behavior;
- incompatible schema handling.
- fixture repository normalization and error results;
- receipt store save, import, list, and correction reload;
- multi-tab conflict detection;
- evidence-reference and sensitive-input guards;
- static-server method, traversal, MIME, CSP, and error-response rules.

### Browser Proof

The in-app browser validates:

- inbox to packet navigation;
- item decisions and validation;
- autosave and refresh recovery;
- submission receipt and JSON export;
- correction creation;
- receipt import after reload;
- keyboard flow and visible focus;
- desktop, tablet, and mobile layouts;
- console logs without errors or warnings.

Browser proof uses the repository's Playwright MCP path first. Manual inspection supplements automated accessibility checks for reading order, focus visibility, zoom, and responsive layout.

### Repository Proof

Before completion, run:

```bash
git diff --check
node --test tools/review-evidence-console/tests/*.test.mjs
pnpm format:check
pnpm lint
pnpm type-check
pnpm pr:verify
pnpm security:guard
pnpm e2e:gate
```

If a mandatory repository gate is blocked by environment or infrastructure, report the exact command, exit code, and blocker. Never infer a pass from a focused check.
