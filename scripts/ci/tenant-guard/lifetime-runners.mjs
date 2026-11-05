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

export const LIFETIME_RUNNERS = deepFreeze([]);
