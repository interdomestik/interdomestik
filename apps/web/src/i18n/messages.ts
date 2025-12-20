import { routing } from './routing';

export const MESSAGE_NAMESPACES = [
  'about',
  'admin',
  'agent',
  'auth',
  'claimCategories',
  'claims',
  'common',
  'consumerRights',
  'dashboard',
  'documents',
  'evidence',
  'features',
  'footer',
  'help',
  'hero',
  'howItWorks',
  'messaging',
  'metadata',
  'nav',
  'notifications',
  'pricing',
  'services',
  'servicesPage',
  'settings',
  'timeline',
  'trust',
  'wizard',
] as const;

export type MessageNamespace = (typeof MESSAGE_NAMESPACES)[number];

export const BASE_NAMESPACES = ['common'] as const;
export const HOME_NAMESPACES = [
  'nav',
  'hero',
  'trust',
  'claimCategories',
  'howItWorks',
  'pricing',
  'footer',
] as const;
export const SITE_NAMESPACES = ['about', 'pricing', 'services'] as const;
export const AUTH_NAMESPACES = ['auth'] as const;
export const APP_NAMESPACES = [
  'nav',
  'dashboard',
  'claims',
  'claimCategories',
  'wizard',
  'documents',
  'evidence',
  'help',
  'settings',
  'messaging',
  'notifications',
  'timeline',
  'consumerRights',
] as const;
export const AGENT_NAMESPACES = ['agent', 'claims', 'messaging', 'notifications'] as const;
export const ADMIN_NAMESPACES = ['admin', 'agent', 'claims', 'messaging', 'notifications'] as const;

type MessageValue =
  | string
  | number
  | boolean
  | null
  | MessageValue[]
  | { [key: string]: MessageValue };

function mergeMessages(fallback: MessageValue, overrides: MessageValue): MessageValue {
  if (Array.isArray(fallback)) {
    return Array.isArray(overrides) ? overrides : fallback;
  }

  if (typeof fallback === 'object' && fallback !== null) {
    const fallbackObj = fallback as Record<string, MessageValue>;
    const overrideObj =
      typeof overrides === 'object' && overrides !== null && !Array.isArray(overrides)
        ? (overrides as Record<string, MessageValue>)
        : {};
    const merged: Record<string, MessageValue> = {};

    for (const key of Object.keys(fallbackObj)) {
      merged[key] =
        key in overrideObj ? mergeMessages(fallbackObj[key], overrideObj[key]) : fallbackObj[key];
    }

    for (const key of Object.keys(overrideObj)) {
      if (!(key in merged)) {
        merged[key] = overrideObj[key];
      }
    }

    return merged;
  }

  return overrides === undefined ? fallback : overrides;
}

export async function loadAllMessages(locale: string) {
  const modules = await Promise.all(
    MESSAGE_NAMESPACES.map(async namespace => {
      try {
        const mod = await import(`../messages/${locale}/${namespace}.json`);
        if (locale === routing.defaultLocale) {
          return mod.default;
        }
        const fallback = await import(`../messages/${routing.defaultLocale}/${namespace}.json`);
        return mergeMessages(fallback.default, mod.default);
      } catch (error) {
        const fallback = await import(`../messages/${routing.defaultLocale}/${namespace}.json`);
        if (locale === routing.defaultLocale) {
          throw error;
        }
        return fallback.default;
      }
    })
  );

  return Object.assign({}, ...modules);
}

export function pickMessages(
  messages: Record<string, unknown>,
  namespaces: readonly MessageNamespace[]
) {
  return namespaces.reduce<Record<string, unknown>>((acc, namespace) => {
    if (namespace in messages) {
      acc[namespace] = messages[namespace];
    }
    return acc;
  }, {});
}
