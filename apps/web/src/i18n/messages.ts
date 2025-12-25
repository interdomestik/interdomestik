import { routing } from './routing';

export const MESSAGE_NAMESPACES = [
  'about',
  'admin',
  'agent',
  'agent-claims',
  'agent-crm',
  'agent-members',
  'auth',
  'claimCategories',
  'claims',
  'common',
  'consumerRights',
  'dashboard',
  'documents',
  'evidence',
  'faq',
  'features',
  'footer',
  'help',
  'hero',
  'howItWorks',
  'howMembershipWorks',
  'legal',
  'memberBenefits',
  'membership',
  'messaging',
  'metadata',
  'nav',
  'nps',
  'notifications',
  'partners',
  'pricing',
  'services',
  'servicesPage',
  'settings',
  'stats',
  'testimonials',
  'timeline',
  'trust',
  'trustStats',
  'voiceClaim',
  'wizard',
] as const;

export type MessageNamespace = (typeof MESSAGE_NAMESPACES)[number];

export const BASE_NAMESPACES = ['common'] as const;
export const HOME_NAMESPACES = [
  'nav',
  'hero',
  'trust',
  'trustStats',
  'memberBenefits',
  'howMembershipWorks',
  'voiceClaim',
  'testimonials',
  'pricing',
  'faq',
  'footer',
] as const;
export const SITE_NAMESPACES = ['about', 'pricing', 'services', 'legal'] as const;
export const AUTH_NAMESPACES = ['auth'] as const;
export const APP_NAMESPACES = [
  'common',
  'nav',
  'dashboard',
  'membership',
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
export const AGENT_NAMESPACES = [
  'common',
  'nav',
  'agent',
  'agent-claims',
  'agent-crm',
  'agent-members',
  'claims',
  'messaging',
  'notifications',
  'settings',
] as const;
export const STAFF_NAMESPACES = [
  'common',
  'nav',
  'agent',
  'agent-claims',
  'claims',
  'messaging',
  'notifications',
] as const;
export const ADMIN_NAMESPACES = [
  'common',
  'nav',
  'admin',
  'agent',
  'agent-claims',
  'agent-crm',
  'agent-members',
  'claims',
  'messaging',
  'notifications',
] as const;

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
        console.error(`Error loading namespace ${namespace} for locale ${locale}:`, error);

        try {
          const fallback = await import(`../messages/${routing.defaultLocale}/${namespace}.json`);
          if (locale === routing.defaultLocale) {
            throw error;
          }
          return fallback.default;
        } catch (fallbackError) {
          console.error(`Failed to load fallback for ${namespace}:`, fallbackError);
          return {};
        }
      }
    })
  );

  return Object.assign({}, ...modules);
}
// Force reload

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
