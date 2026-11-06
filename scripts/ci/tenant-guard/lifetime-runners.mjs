// Reviewed transaction runners for the lifetime stage L1 (see rules-lifetime-runners.mjs). A module,
// not JSON, so the protected required workflow loads it through its closed .mjs closure; changing it
// changes what the guard admits, so it is part of the owner-pinned guard source.
//
// Each entry names a module-private top-level function declaration (`unit`) in `file`, bound to the
// whole file's SHA-256. `callback` is the index of the parameter the runner hands the transaction
// to; `lends` lists the parameters that carry a caller's borrowed transaction into that callback.
// A runner whose file changes by one byte is ordinary code again and its forwarding is refused.
const deepFreeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
};

export const LIFETIME_RUNNERS = deepFreeze([
  {
    // Grant reads: pins row security and the access tenant, then reads on the transaction it opens
    // or on the caller's own transaction (parameter 0) when it is handed one.
    file: 'apps/web/src/app/api/documents/durable-case-grants.ts',
    unit: 'withGrantReadContext',
    sha256: '184f475d6e7989816be8e81d24b393410148512bf8d5b962bd93c056d2abc35f',
    callback: 2,
    lends: [0],
  },
  {
    // Grant-bound document reads: pins row security and the home tenant the same way.
    file: 'apps/web/src/app/api/documents/cross-tenant-document-lookup.ts',
    unit: 'withDocumentReadContext',
    sha256: 'e5d6ceac85c6df6a07636a36911f2a6877cddca4c6c0663705e4c1bb5234632c',
    callback: 2,
    lends: [0],
  },
  {
    // The same runner after the staff draft change to its file (owner 2026-11-06, Plan070 with
    // Codex): the runner itself is unchanged; the entry above stays until main carries this file.
    file: 'apps/web/src/app/api/documents/cross-tenant-document-lookup.ts',
    unit: 'withDocumentReadContext',
    sha256: 'e3e9a34d1b0f84987e7e139a85354fdf7ca0b34f8a67a7f0c445c6cc8cd3a43d',
    callback: 2,
    lends: [0],
  },
  {
    // Email recovery: serializes one user with a transaction-scoped advisory lock.
    file: 'apps/web/src/lib/auth/different-email-recovery-store.ts',
    unit: 'withUserLock',
    sha256: 'a4c2ad777bef4f864e96b7c4ecf03332d657a857e278599f17866230af922295',
    callback: 1,
    lends: [],
  },
]);
