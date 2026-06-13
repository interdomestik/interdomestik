import type { LawPack } from './law-pack-schema';
import { InvalidLawPackError, validateLawPack } from './law-pack-schema';

export const SUPPORTED_LAW_PACK_COUNTRIES = ['MK', 'XK'] as const;

export type LawPackCountry = (typeof SUPPORTED_LAW_PACK_COUNTRIES)[number];
export type LawPackLoader = () => Promise<unknown> | unknown;

export class UnsupportedLawPackCountryError extends Error {
  readonly code = 'unsupported_law_pack_country' as const;

  constructor(readonly countryCode: string | null) {
    super(`Unsupported recovery law-pack country: ${countryCode ?? 'invalid'}`);
    this.name = 'UnsupportedLawPackCountryError';
  }
}

type LawPackRegistry = {
  loadLawPack(countryCode: string | null | undefined): Promise<LawPack>;
  clearCache(): void;
  supportedCountries: readonly string[];
};

const COUNTRY_CODE = /^[A-Z]{2}$/u;

const defaultLoaders = {
  MK: async () => (await import('./law-packs/mk')).lawPack,
  XK: async () => (await import('./law-packs/xk')).lawPack,
} satisfies Record<LawPackCountry, LawPackLoader>;

export function createLawPackRegistry(loaders: Record<string, LawPackLoader>): LawPackRegistry {
  const normalizedLoaders = new Map<string, LawPackLoader>();
  const cache = new Map<string, Promise<LawPack>>();

  for (const [countryCode, loader] of Object.entries(loaders)) {
    const normalized = normalizeLawPackCountry(countryCode);

    if (normalized) {
      normalizedLoaders.set(normalized, loader);
    }
  }

  return {
    supportedCountries: [...normalizedLoaders.keys()],
    clearCache: () => cache.clear(),
    loadLawPack: async countryCode => {
      const normalized = normalizeLawPackCountry(countryCode);
      const loader = normalized ? normalizedLoaders.get(normalized) : undefined;

      if (!normalized || !loader) {
        throw new UnsupportedLawPackCountryError(normalized);
      }

      let cached = cache.get(normalized);

      if (!cached) {
        cached = Promise.resolve()
          .then(loader)
          .then(validateLawPack)
          .then(pack => assertRequestedCountry(normalized, pack));
        cache.set(normalized, cached);
      }

      return cached;
    },
  };
}

function normalizeLawPackCountry(countryCode: string | null | undefined): string | null {
  const normalized = countryCode?.trim().toUpperCase();
  return normalized && COUNTRY_CODE.test(normalized) ? normalized : null;
}

function assertRequestedCountry(countryCode: string, lawPack: LawPack): LawPack {
  if (lawPack.countryCode !== countryCode) {
    throw new InvalidLawPackError({
      expectedCountryCode: countryCode,
      actualCountryCode: lawPack.countryCode,
    });
  }

  return lawPack;
}

const defaultRegistry = createLawPackRegistry(defaultLoaders);

export const loadLawPack = defaultRegistry.loadLawPack;
export const clearLawPackCacheForTests = defaultRegistry.clearCache;
