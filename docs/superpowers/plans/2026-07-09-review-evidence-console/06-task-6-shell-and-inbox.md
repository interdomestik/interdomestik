# Task 6: App Shell And Assignment Inbox

[Back to the canonical implementation-plan index](../2026-07-09-review-evidence-console.md)

### Task 6: Build The App Shell And Assignment Inbox

**Files:**

- Create: `tools/review-evidence-console/public/src/app.mjs`
- Create: `tools/review-evidence-console/public/src/components/dom.mjs`
- Create: `tools/review-evidence-console/public/src/components/status.mjs`
- Create: `tools/review-evidence-console/public/src/views/inbox.mjs`
- Create: `tools/review-evidence-console/public/styles/tokens.css`
- Create: `tools/review-evidence-console/public/styles/base.css`
- Create: `tools/review-evidence-console/public/styles/layout.css`
- Create: `tools/review-evidence-console/public/styles/components.css`
- Create: `tools/review-evidence-console/public/styles/responsive.css`
- Test: `tools/review-evidence-console/tests/dom-and-inbox.test.mjs`

- [ ] **Step 1: Implement safe DOM helpers**

RED tests assert that `innerHTML` is rejected, user content is written through `textContent`, attributes are allowlisted, and loading, empty, unavailable, and populated inbox states render correctly.

Provide `element(tag, options)`, `text(value)`, `replaceChildren(target, children)`, and `announce(message)`. `element` may set allowlisted attributes and event listeners; it must place copy through `textContent` and reject an `innerHTML` option.

- [ ] **Step 2: Add Interdomestik-derived tokens and base styles**

Use the approved deep blue, teal, cool surfaces, 12px radius, Space Grotesk/Inter/system fallbacks, visible focus, 44px touch targets, and non-color status labels. Keep each stylesheet below 150 lines.

- [ ] **Step 3: Render the local-proof app header**

The header must show `Review & Evidence Console`, `Local review fixture`, reviewer role, autosave live region, and a local-data menu. It must not imply production authentication.

- [ ] **Step 4: Render the reviewer-first inbox**

Use cards, not a table. Each card shows canonical packet ID, Albanian title, purpose, risk label, progress, and `Open packet` or `Resume packet`. Include empty, loading, and unavailable states.

- [ ] **Step 5: Start the server and verify the inbox manually**

Run:

```bash
node tools/review-evidence-console/server/start.mjs
```

Expected: prints one `http://127.0.0.1:<port>` URL. Open it with the in-app browser. Confirm one Part A card and one Part B card render, navigation controls have visible focus, and browser logs contain no errors or warnings.

- [ ] **Step 6: Commit the shell and inbox**

Keep bootstrapping in `app.mjs`; extract controller, inbox, and view rendering into separate modules before any file exceeds 150 lines.

```bash
git add tools/review-evidence-console/public/index.html tools/review-evidence-console/public/src/app.mjs tools/review-evidence-console/public/src/components tools/review-evidence-console/public/src/views/inbox.mjs tools/review-evidence-console/public/styles
git commit -m "feat: add reviewer assignment inbox"
```
