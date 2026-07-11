# Design Appendix 1: Context, Authority, And Scope

[Back to the canonical design index](../2026-07-09-review-evidence-console-design.md)

## Goal

Create a standalone internal console that helps an assigned reviewer complete one evidence packet quickly, safely, and with an auditable result. The console produces evidence for the repository's current-authority process; it never grants execution authority.

## Authority And Context

This design follows the repository authority at `main` commit `2d63bc79d5e0c54cbb75da2c83e9f3ecfca84c89`.

The AI OS under `/Users/arbenlila/Documents/Knowledge Manager and Systems Architect` remains advisory. Its 2026-07-09 `Now` and `Next Product Actions` pages still cite `main` at `1a15b956` after `MOB-02a`. The repository has since added `MOB-DG04` and the `MOB-03a` authority evidence packet. Repository authority wins. The latest packet still states:

```text
status: blocked_requires_current_authority
activeSlice: null
```

The console therefore remains separate from Interdomestik runtime. It must not alter canonical routes, `apps/web/src/proxy.ts`, auth, tenancy, billing, schema, RLS, member data, claim data, or current-authority records.

## Current Portal Evaluation

The protected portal at `https://reviewer-ecohub.vercel.app` already proves the core need. It captures reviewer identity, assigned steps, explicit decisions, evidence references, risks, corrections, autosaved drafts, and submissions.

The audit found five primary usability problems:

1. The landing page makes reviewers pass through identity fields, correction mode, status cards, filters, and a 17-step operational table before they reach one decision.
2. The workbench keeps a long process tab bar, item list, oversized mock-phone preview, guidance, decision form, evidence fields, and submission controls on one page.
3. The interface mixes Albanian product copy with dense English technical language and repo paths without a clear hierarchy.
4. Desktop space is poorly allocated: the mock-phone panel creates a large empty area while decision fields sit below the fold.
5. The mobile table clips horizontally and requires scanning controls designed for desktop.

The existing portal also stores low-sensitivity uploads in public Vercel Blob storage. The new v1 removes uploads and uses repo-safe evidence references only.

## Primary User And Outcome

The primary user is an assigned internal reviewer such as a business, operations, legal, privacy, product, or platform owner.

The primary outcome is:

> Complete one assigned evidence packet with explicit decisions, real evidence references, visible validation, and a durable submission receipt.

The console is reviewer-first. Operator dashboards, global analytics, assignment administration, and cross-product portfolio views remain outside v1.

## Local Design-Proof Boundary

The v1 is a local design proof, not an authenticated review system. Bundled assignments and internal reviewer profiles are repo-safe fixtures. The assignment inbox demonstrates the reviewer flow; it does not enforce authorization or prove that a real person received an assignment.

An internal reviewer profile may contain a display name, role, and fixture ID. It must not contain an email address, phone number, account ID, or customer identity. The UI labels fixture assignments as `Local review fixture`. Production identity, authentication, assignment delivery, and access control require a separate approved design.

## Success Criteria

The v1 succeeds when a reviewer can:

- open an assigned packet without first navigating a global operations table;
- understand the packet scope and stop conditions;
- complete each item with an explicit `approve`, `change`, or `block` decision;
- distinguish system guidance from the human decision;
- record a concrete answer, reason, evidence reference, verification date, risk category, and severity;
- recover a local draft after refresh or temporary failure;
- see all missing fields before submission;
- submit the complete packet and export a read-only JSON receipt;
- create a correction as a new version without overwriting prior evidence;
- complete the flow on desktop, tablet, or mobile without horizontal tables.

## Scope

### Included

- a standalone tracked app under `tools/review-evidence-console/`;
- an assignment inbox containing realistic repo-safe packets;
- repo-safe fixture assignments and internal reviewer profiles;
- a guided review workspace;
- local draft persistence;
- explicit decision and evidence fields;
- packet validation;
- versioned corrections;
- read-only completion receipts;
- JSON receipt export;
- responsive behavior and accessible interaction states;
- Albanian-first UI copy with canonical English packet and item IDs.

### Excluded

- Interdomestik runtime integration;
- changes under `apps/web/` or `packages/`;
- `/member`, `/agent`, `/staff`, or `/admin` routes;
- current-authority promotion or tracker mutation;
- member, claim, payment, medical, or customer identity records;
- network file uploads or remote file transfer; local receipt import remains included;
- production authentication or deployment;
- real assignment authorization or delivery;
- Vercel Blob writes;
- AI-generated decisions;
- global operator analytics;
- assignment authoring or reviewer administration;
- README, AGENTS, architecture, schema, RLS, billing, or notification changes.
