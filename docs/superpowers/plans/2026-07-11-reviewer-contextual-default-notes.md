# Reviewer Contextual Default Notes Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prefill safe, item-specific Albanian reviewer notes while preserving manual decisions, reviewer edits, draft history, and receipt integrity.

**Architecture:** Fixture data owns the copy; strict normalization validates it; a focused contextual-note state module owns versioned state and transitions. The existing session orchestrator calls that module on decision and conditional-response changes, while draft validation and receipt tests enforce fail-closed persistence and metadata isolation.

**Tech Stack:** Browser-native ES modules, Node.js test runner, localStorage draft persistence, Playwright browser tests, JSON/MJS fixture generation.

**Approved design:** `docs/superpowers/specs/2026-07-11-reviewer-contextual-default-notes-design.md`

---

## Ordered implementation parts

The complete approved task text is preserved verbatim in these ordered parts:

1. [Part 1 — Fixture and normalization contract](./2026-07-11-reviewer-contextual-default-notes-plan-part-1.md)
2. [Part 2 — Versioned note state and session behavior](./2026-07-11-reviewer-contextual-default-notes-plan-part-2.md)
3. [Part 3 — Receipt isolation, browser proof, and gates](./2026-07-11-reviewer-contextual-default-notes-plan-part-3.md)

## Implementation start and scope

Task 3 records the implementation-start commit before feature implementation. Task 8 audits
the range from that commit through `HEAD`. Feature commits are limited to
`tools/review-evidence-console/` plus this approved spec/plan documentation; paused
deployment work remains separate and untouched.
