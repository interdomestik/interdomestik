import { routing } from './routing';

export const MESSAGE_NAMESPACES = [
  'about',
  'admin',
  'admin-branches',
  'admin-claims',
  'admin-common',
  'admin-dashboard',
  'admin-leads',
  'admin-settings',
  'admin-users',
  'agent',
  'agent-claims',
  'agent-crm',
  'agent-members',
  'auth',
  'claimCategories',
  'claims',
  'claims-tracking',
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
  'agent',
  'agent-claims',
  'agent-crm',
  'agent-members',
  'claims',
  'claims-tracking',
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
  'admin',
  'common',
  'nav',
  'admin-common',
  'admin-dashboard',
  'admin-users',
  'admin-claims',
  'admin-branches',
  'admin-settings',
  'admin-leads',
  'agent',
  'agent-claims',
  'agent-crm',
  'agent-members',
  'claims',
  'messaging',
  'notifications',
] as const;

import { mergeMessages } from './utils/merge';

type LoadAllMessagesOptions = {
  strict?: boolean;
};

export async function loadAllMessages(locale: string, options: LoadAllMessagesOptions = {}) {
  const strict = options.strict === true;
  const modules = await Promise.all(
    MESSAGE_NAMESPACES.map(async namespace => {
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

        // Special handling for split admin files to merge them under 'admin' key
        if (namespace.startsWith('admin-')) {
          // If the file content isn't wrapped in 'admin', wrap it?
          // Actually, the easiest way is to NOT wrap them in the file, but wrap them here.
          // BUT, to maintain backward compatibility with current structure which wraps in "admin":
          // The current plan implies the new files will contain { "admin": { "sidebar": ... } }
          // If so, simple merge works.
          // Let's assume the new files will mirror the structure: { "admin": { "sub-section": ... } }
          return messages;
        }

        return messages;
      } catch {
        if (strict) {
          throw new Error(
            `[i18n] Missing messages file for locale=${locale} namespace=${namespace}`
          );
        }

        try {
          // Try loading fallback locale if main failed entirely
          const fallback = await import(`../messages/${routing.defaultLocale}/${namespace}.json`);
          return fallback.default;
        } catch {
          return {};
        }
      }
    })
  );

  // Use deep merge for the final object accumulation to ensure 'admin' keys from different files merge correctly
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
