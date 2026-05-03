# P30 Commercial UX North Star Alignment

## Status

Completed through PR `#613` as the next bounded product-experience tranche after completed `P29`.

## Input

The commercial and UI/UX review identified that the platform already has strong building blocks: Claim Pack, Coverage Matrix, claim timeline, human fallback, commercial disclaimers, and dashboard trust cues. The remaining gap is mostly message consistency: the member experience should explain the value in concrete terms a potential member recognizes immediately.

## Completed Slice

`P30-MEM01 Member North Star Copy Alignment`

This slice is limited to existing localized member-dashboard copy. It aligns the dashboard hero and trust cues around:

- the member's case file
- exact next steps
- evidence upload
- case-status tracking
- organized documents
- unique case number
- clear next step

## Explicit Non-Scope

This tranche does not authorize:

- `apps/web/src/proxy.ts` changes
- canonical route changes
- auth or tenancy refactors
- schema changes
- Stripe reintroduction
- homepage variant implementation
- partner activation implementation
- product analytics expansion
- broad SaaS redesign
- CRM redesign
- agent-workspace redesign
- README, AGENTS, or architecture-doc updates

SOCIAL homepage variants, PARTNER activation variants, Coverage Matrix placement changes, Trust Center work, Green Card public-guide work, and funnel tracking expansion remain candidates for a later bounded design gate.

## Verification

Required verification for the implementation PR:

- JSON validity for touched message bundles
- focused unit or rendering checks where applicable
- `pnpm pr:verify`
- `pnpm security:guard`
- `pnpm e2e:gate`
