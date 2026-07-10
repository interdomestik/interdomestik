# Review & Evidence Console Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone, reviewer-first console that completes a repo-safe `MOB-03a` evidence packet, preserves drafts and corrections locally, and exports an auditable receipt without changing Interdomestik runtime.

**Architecture:** A dependency-free local web app lives under `tools/review-evidence-console/`. A loopback-only Node server serves static HTML, CSS, JSON, and ES modules; pure repositories, validators, stores, and receipt helpers own data behavior; small render functions own each screen. The app uses fixture assignments and local browser storage only.

**Tech Stack:** Node.js 24, HTML, CSS, ES modules, Web Crypto, `localStorage`, Node's built-in test runner, in-app Browser/Playwright MCP.

**Approved spec:** `docs/superpowers/specs/2026-07-09-review-evidence-console-design.md`

**Execution isolation:** Start implementation in a dedicated `codex/review-evidence-console` worktree from the commit that contains this approved plan and spec. Do not edit `apps/web/`, `packages/`, `apps/web/src/proxy.ts`, README, AGENTS, or architecture files.

---

## File Structure

Create only these implementation files:

```text
tools/review-evidence-console/
├── public/
│   ├── index.html                     # Semantic app shell and stylesheet/module entrypoints
│   ├── data/
│   │   ├── assignments.json           # Repo-safe local assignment fixtures
│   │   ├── reviewers.json             # Repo-safe reviewer fixture profiles
│   │   └── packets/
│   │       ├── mob-03a-part-a.json    # Four Part A item definitions
│   │       └── mob-03a-part-b.json    # Four Part B item definitions
│   ├── src/
│   │   ├── app.mjs                    # App bootstrap and view transitions
│   │   ├── router.mjs                 # Hash-route parsing and navigation
│   │   ├── data/fixture-repository.mjs# Fixture loading and cross-record validation
│   │   ├── models/normalize-fixture.mjs# Reviewer, assignment, and packet normalization
│   │   ├── models/normalize-review.mjs# Item, decision, and draft normalization
│   │   ├── models/normalize-suggestion.mjs# Strict fixture suggestion contract
│   │   ├── validation/input-guards.mjs# Repo-reference and sensitive-input validation
│   │   ├── validation/item.mjs        # Descriptor-driven item validation
│   │   ├── validation/packet.mjs      # Ordered packet validation and error grouping
│   │   ├── state/canonical-json.mjs   # Stable recursive key ordering and serialization
│   │   ├── state/draft-store.mjs      # Draft keys, optimistic saves, conflicts, recovery
│   │   ├── state/receipt-builder.mjs  # Risk summary, SHA-256 ID, tamper-evident payload
│   │   ├── state/receipt-store.mjs    # Receipt persistence, import, hash validation, deletion
│   │   ├── state/review-session.mjs   # In-memory reviewer state and item transitions
│   │   ├── state/review-suggestions.mjs# One-time suggestion initialization
│   │   ├── components/dom.mjs         # Safe DOM helpers using textContent only
│   │   ├── components/display-labels.mjs# Albanian labels for canonical values
│   │   ├── components/packet-rail.mjs # Packet progress and item navigation
│   │   ├── components/decision.mjs    # Explicit decision and evidence form controls
│   │   ├── components/status.mjs      # Autosave, scope, validation, and risk notices
│   │   ├── views/inbox.mjs            # Fixture assignment inbox
│   │   ├── views/workspace.mjs        # Three-region guided review workspace
│   │   ├── views/validation.mjs       # Grouped missing-field summary
│   │   ├── views/receipt.mjs          # Receipt, export, import, and correction entry
│   │   └── app/receipt-confirmation.mjs# Localized clear-receipt confirmation
│   └── styles/
│       ├── tokens.css                 # Interdomestik-derived colors, type, radius, spacing
│       ├── base.css                   # Reset, typography, focus, form primitives
│       ├── layout.css                 # Shell, inbox, workspace, rails, receipt layout
│       ├── components.css             # Cards, buttons, decision states, notices
│       └── responsive.css             # Tablet/mobile/reduced-motion/zoom behavior
├── server/
│   ├── app.mjs                        # Loopback static-server contract
│   └── start.mjs                      # CLI entrypoint and port validation
└── tests/
    ├── server.test.mjs
    ├── fixture-repository.test.mjs
    ├── input-guards.test.mjs
    ├── item-validation.test.mjs
    ├── packet-validation.test.mjs
    ├── draft-store.test.mjs
    ├── receipt-builder.test.mjs
    ├── receipt-store.test.mjs
    ├── review-session.test.mjs
    ├── albanian-copy.test.mjs
    ├── display-labels.test.mjs
    ├── workspace-albanian.test.mjs
    ├── review-suggestion.test.mjs
    └── review-suggestions.test.mjs
```

Keep every JavaScript and CSS file below 150 lines. If a task would cross that limit, extract the named responsibility before adding more code.

---

## Modular Task Index

Execute these files in order; task continuations retain the original step and command ordering.

1. [Task 1 — loopback static server](./2026-07-09-review-evidence-console/01-task-1-loopback-static-server.md)
2. [Task 2A — fixture repository tests](./2026-07-09-review-evidence-console/02a-task-2-fixture-repository-tests.md)
3. [Task 2B — fixture repository implementation](./2026-07-09-review-evidence-console/02b-task-2-fixture-repository-implementation.md)
4. [Task 3A — input guard tests](./2026-07-09-review-evidence-console/03a-task-3-input-guard-tests.md)
5. [Task 3B — descriptor tests](./2026-07-09-review-evidence-console/03b-task-3-descriptor-tests.md)
6. [Task 3C — validation implementation](./2026-07-09-review-evidence-console/03c-task-3-validation-implementation.md)
7. [Task 4A — draft persistence tests](./2026-07-09-review-evidence-console/04a-task-4-draft-tests.md)
8. [Task 4B — receipt builder tests](./2026-07-09-review-evidence-console/04b-task-4-receipt-builder-tests.md)
9. [Task 4C — receipt store tests](./2026-07-09-review-evidence-console/04c-task-4-receipt-store-tests.md)
10. [Task 4D — persistence implementation and checkpoint](./2026-07-09-review-evidence-console/04d-task-4-persistence-implementation.md)
11. [Task 5 — session state and routing](./2026-07-09-review-evidence-console/05-task-5-session-and-routing.md)
12. [Task 6 — app shell and inbox](./2026-07-09-review-evidence-console/06-task-6-shell-and-inbox.md)
13. [Task 7 — guided workspace](./2026-07-09-review-evidence-console/07-task-7-guided-workspace.md)
14. [Task 8 — validation and receipts](./2026-07-09-review-evidence-console/08-task-8-validation-and-receipts.md)
15. [Task 9 — responsive accessibility](./2026-07-09-review-evidence-console/09-task-9-responsive-accessibility.md)
16. [Task 10 — mandatory verification](./2026-07-09-review-evidence-console/10-task-10-mandatory-verification.md)
17. [Task 11 — Albanian-first localization](./2026-07-09-review-evidence-console/11-task-11-albanian-first-localization.md)
18. [Task 12A — suggestion fixture contract](./2026-07-09-review-evidence-console/12a-task-12-suggestion-fixtures.md)
19. [Task 12B — suggestion session state](./2026-07-09-review-evidence-console/12b-task-12-suggestion-state.md)
20. [Task 12C — suggestion UX and receipt proof](./2026-07-09-review-evidence-console/12c-task-12-suggestion-ux-proof.md)

## Exact Authorized Paths

- `tools/review-evidence-console/**`;
- the canonical spec and `docs/superpowers/specs/2026-07-09-review-evidence-console-design/**`;
- this canonical plan and `docs/superpowers/plans/2026-07-09-review-evidence-console/**`;
- `docs/plans/2026-07-10-rec-dg01-review-evidence-console-current-authority.md`;
- the REC rows in `docs/plans/current-program.md` and `docs/plans/current-tracker.md`;
- `scripts/repo-size-budget.json` only for a measured inventory update.

Local `.superpowers/` brainstorming evidence remains ignored and untracked.
