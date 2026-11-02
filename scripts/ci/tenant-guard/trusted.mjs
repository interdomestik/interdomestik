// The trusted tree legacy forms are compared against. OWNER PIN: set by the owner to an
// immutable reviewed commit and its tree id; the guard verifies the pair before use.
// 2026-11-02: owner-authorized switch from the legacy DB access guard to S″, pinned to the
// reviewed main commit the TenantAuthority migration was measured against.
export const TRUSTED = Object.freeze({
  commit: '859d5019a4e4134f7580033f71460f1602b372aa',
  tree: '44d8b3e7730ca1c0aaa6a006aa63cf59f361618a',
});
