import { routing } from './routing';

export const MESSAGE_NAMESPACES = [
  'about',
  'admin',
  'admin-branches',
  'admin-claims',
  'admin-commissions',
  'admin-common',
  'admin-dashboard',
  'admin-leads',
  'admin-settings',
  'admin-users',
  'agent',
  'agent-claims',
  'agent-crm',
  'agent-members',
  'agent-toolkit',
  'auth',
  'claimCategories',
  'claims',
  'claims-tracking',
  'commercialTerms',
  'common',
  'coverageMatrix',
  'consumerRights',
  'dashboard',
  'diaspora',
  'documents',
  'evidence',
  'faq',
  'features',
  'footer',
  'freeStart',
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
  'freeStart',
  'trust',
  'trustStats',
  'memberBenefits',
  'howMembershipWorks',
  'voiceClaim',
  'testimonials',
  'pricing',
  'commercialTerms',
  'faq',
  'footer',
] as const;
export const SITE_NAMESPACES = ['about', 'pricing', 'services', 'legal'] as const;
export const AUTH_NAMESPACES = ['auth'] as const;
export const APP_NAMESPACES = [
  'common',
  'nav',
  'dashboard',
  'diaspora',
  'membership',
  'claims',
  'claims-tracking',
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
  'voiceClaim',
] as const;
export const AGENT_NAMESPACES = [
  'common',
  'nav',
  'dashboard',
  'agent',
  'agent-claims',
  'agent-crm',
  'agent-members',
  'agent-toolkit',
  'claims',
  'claims-tracking',
  'messaging',
  'notifications',
  'settings',
] as const;
export const STAFF_NAMESPACES = [
  'common',
  'nav',
  'dashboard',
  'agent',
  'agent-claims',
  'claims',
  'claims-tracking',
  'messaging',
  'notifications',
] as const;
export const ADMIN_NAMESPACES = [
  'admin',
  'common',
  'nav',
  'dashboard',
  'admin-common',
  'admin-dashboard',
  'admin-users',
  'admin-claims',
  'admin-commissions',
  'admin-branches',
  'admin-settings',
  'admin-leads',
  'agent',
  'agent-claims',
  'agent-crm',
  'agent-members',
  'claims',
  'claims-tracking',
  'messaging',
  'notifications',
] as const;

import { mergeMessages } from './utils/merge';

type LoadAllMessagesOptions = {
  strict?: boolean;
};

async function loadNamespaceMessages(
  locale: string,
  namespace: MessageNamespace,
  options: LoadAllMessagesOptions = {}
) {
  const strict = options.strict === true;
  try {
    const mod = await import(`../messages/${locale}/${namespace}.json`);
    let messages = mod.default;

    if (locale !== routing.defaultLocale) {
      try {
        const fallback = await import(`../messages/${routing.defaultLocale}/${namespace}.json`);
        messages = mergeMessages(fallback.default, messages);
      } catch {
        if (strict) {
          throw new Error(
            `[i18n] Missing fallback messages file for locale=${routing.defaultLocale} namespace=${namespace}`
          );
        }

        // Fallback might fail if the file doesn't exist, just use what we have.
      }
    }

    return messages;
  } catch {
    if (strict) {
      throw new Error(`[i18n] Missing messages file for locale=${locale} namespace=${namespace}`);
    }

    try {
      const fallback = await import(`../messages/${routing.defaultLocale}/${namespace}.json`);
      return fallback.default;
    } catch {
      return {};
    }
  }
}

export async function loadMessagesForNamespaces(
  locale: string,
  namespaces: readonly MessageNamespace[],
  options: LoadAllMessagesOptions = {}
) {
  const modules = await Promise.all(
    namespaces.map(namespace => loadNamespaceMessages(locale, namespace, options))
  );

  return modules.reduce((acc, curr) => mergeMessages(acc, curr), {});
}

export async function loadAllMessages(locale: string, options: LoadAllMessagesOptions = {}) {
  const modules = await Promise.all(
    MESSAGE_NAMESPACES.map(namespace => loadNamespaceMessages(locale, namespace, options))
  );

  return modules.reduce((acc, curr) => mergeMessages(acc, curr), {});
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
