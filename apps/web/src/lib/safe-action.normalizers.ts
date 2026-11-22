import { z } from 'zod';

function freezeCheck<T extends z.core.$ZodCheck>(check: T): T {
  Object.freeze(check._zod.def);
  Object.freeze(check._zod);
  return Object.freeze(check);
}

const normalizers = {
  trim: () => z.trim(),
  toLowerCase: () => z.toLowerCase(),
  toUpperCase: () => z.toUpperCase(),
  normalizeNFC: () => z.normalize('NFC'),
  normalizeNFKC: () => z.normalize('NFKC'),
};

export const actionNormalizers = Object.freeze({
  trim: freezeCheck(normalizers.trim()),
  toLowerCase: freezeCheck(normalizers.toLowerCase()),
  toUpperCase: freezeCheck(normalizers.toUpperCase()),
  normalizeNFC: freezeCheck(normalizers.normalizeNFC()),
  normalizeNFKC: freezeCheck(normalizers.normalizeNFKC()),
});

export type Normalizer = keyof typeof actionNormalizers;
const identities = new Map<unknown, Normalizer>(
  (Object.keys(actionNormalizers) as Normalizer[]).map(name => [actionNormalizers[name], name])
);

export const normalizerOf = (check: unknown): Normalizer | undefined => identities.get(check);

export const privateNormalizer = (name: Normalizer): z.core.$ZodCheck => normalizers[name]();
