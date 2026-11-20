# Interdomestik Code Review Guidance

The review rules are in `AGENTS.md`, section 1: R-01, R-02 and the paragraph on what a review is. This file holds no rule of its own. Its headings are kept so that whoever looks for an old section finds where it went; `docs/engineering/RULES-MAPPING.md`, part 2, maps every old line.

## Review Posture

`AGENTS.md`, section 1: a review is read-only; findings first, by severity, with file and line; a doubt is no approval.

## Highest-Risk Areas

`AGENTS.md`, section 3 (tiers T4 to T6) and section 5 (the boundaries).

## Phase C Rules To Enforce

`AGENTS.md`, R-34 (the proxy, the canonical routes, the markers), R-29 (no refactor that nobody asked for) and R-18 (payments through the provider-neutral port; the provider is open since the owner's decision of 2026-11-15). The Phase C program is finished.

## Finding Buckets

`AGENTS.md`, section 1: `blocker`, `hardening`, `optional`, `rejected`.

## Review Selection

`AGENTS.md`, R-01 and R-02: the lead routes the reviews; a blocked reviewer is no approval; no paid API as a fallback.
