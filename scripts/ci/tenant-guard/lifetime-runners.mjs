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
    sha256: '5a093207756d54cda4daf2b12dbee6013cfdf2710ce2ba32921078394c639d14',
    callback: 2,
    lends: [0],
  },
  {
    // Grant-bound document reads: pins row security and the home tenant the same way.
    file: 'apps/web/src/app/api/documents/cross-tenant-document-lookup.ts',
    unit: 'withDocumentReadContext',
    sha256: 'a77e78110a55eb999818774fd425dacfa339b58d5cf67ff967616a2de1e926c2',
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
