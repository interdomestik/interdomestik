// The trusted tree legacy forms are compared against. OWNER PIN: set by the owner to an
// immutable reviewed commit and its tree id; the guard verifies the pair before use.
// 2026-11-02: owner-authorized switch from the legacy DB access guard to S″, pinned to the
// reviewed main commit the TenantAuthority migration was measured against.
// 2026-11-05: owner-approved advance to main a9e79c23f for the S8 lifetime transition; every
// intervening merge (#1941-#1972) passed the protected S2 exact-merge check (Codex r12).
export const TRUSTED = Object.freeze({
  commit: 'a9e79c23f6c3d7a326774cee07b71054ee911793',
  tree: '529031084338b3488c6e51413ede5cca79b77b82',
});
