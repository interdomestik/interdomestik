import { z } from 'zod';

// The only value-changing checks an action's input schema may carry (design addendum 3, owner
// approval after Astra r4 B03). zod 4 builds its own trim/case/normalize as anonymous `overwrite`
// closures with no identifying metadata, so the definition walk recognises these instances by
// identity instead. Each is frozen, so its transform cannot be replaced after import.
//
//   input: z.strictObject({ email: z.string().check(actionNormalizers.trim, actionNormalizers.toLowerCase) })
function frozen<T extends object>(check: T): T {
  const internals = (check as unknown as { _zod: { def: object } })._zod;
  Object.freeze(internals.def);
  Object.freeze(internals);
  return Object.freeze(check);
}

export const actionNormalizers = Object.freeze({
  trim: frozen(z.trim()),
  toLowerCase: frozen(z.toLowerCase()),
  toUpperCase: frozen(z.toUpperCase()),
  normalizeNFC: frozen(z.normalize('NFC')),
  normalizeNFKC: frozen(z.normalize('NFKC')),
});

const NORMALIZERS: ReadonlySet<unknown> = new Set(Object.values(actionNormalizers));

export const isActionNormalizer = (check: unknown): boolean => NORMALIZERS.has(check);
