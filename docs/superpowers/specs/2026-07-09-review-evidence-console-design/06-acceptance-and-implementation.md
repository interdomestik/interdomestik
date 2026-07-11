# Design Appendix 6: Acceptance And Implementation

[Back to the canonical design index](../2026-07-09-review-evidence-console-design.md)

## Acceptance Criteria

The implementation is acceptable when:

1. Authorized tracked paths are limited to `tools/review-evidence-console/**`, this approved spec plus `docs/superpowers/specs/2026-07-09-review-evidence-console-design/**`, the approved plan plus `docs/superpowers/plans/2026-07-09-review-evidence-console/**`, `docs/plans/2026-07-10-rec-dg01-review-evidence-console-current-authority.md`, the REC rows in `docs/plans/current-program.md` and `docs/plans/current-tracker.md`, and a measured `scripts/repo-size-budget.json` inventory update. Local `.superpowers/` brainstorming evidence remains ignored and untracked.
2. It does not modify Interdomestik runtime, routing, auth, tenancy, billing, schema, RLS, README, AGENTS, or architecture files.
3. It demonstrates the four primary product states with realistic `MOB-03a` repo-safe content.
4. A reviewer can complete, validate, submit, export, reload, and correct a packet.
5. Every decision remains human-owned and explicit.
6. The app exposes no network upload path, reads receipt imports locally only, includes no sensitive fixture data, and rejects the prohibited reference and sensitive-input test cases defined above.
7. Desktop, tablet, mobile, keyboard, and reduced-motion flows remain usable.
8. Focused tests and mandatory repository gates produce fresh evidence.

## Implementation Decision

Build the standalone console as dependency-free HTML, CSS, and ES modules served by a small Node static server. This keeps the app isolated, reviewable, and runnable with the repository's existing Node runtime. The implementation may use Lucide icons only if the existing package can be consumed without adding a new dependency; otherwise it should use text labels and native controls.

Use bundled/system font stacks so the local app works offline: `Space Grotesk, Inter, ui-sans-serif, system-ui, sans-serif` for headings and `Inter, ui-sans-serif, system-ui, sans-serif` for body copy. Do not fetch fonts from a CDN.

Do not modify or deploy the existing protected reviewer portal in this slice. The new console is a local working app and design proof. Production authentication, private remote persistence, and deployment require a separate approved design and authority decision.
