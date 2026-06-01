export const SUPPORTED_MESSAGE_LOCALES = ['sq', 'en', 'sr', 'mk'];

export const BANNED_BRAND_FRAMINGS = [
  {
    label: 'no-win-no-fee framing',
    pattern: /\bno win,? no fee\b/i,
  },
  {
    label: 'money-back guarantee framing',
    pattern: /\bmoney[- ]back guarantee\b|\b30-day guarantee period\b/i,
  },
  {
    label: 'guaranteed service/result framing',
    pattern: /\bguaranteed (?:service|result|outcome|recovery|compensation|payout)\b/i,
  },
  {
    label: 'compensation promise framing',
    pattern: /\bget your compensation\b|\bcompensation you deserve\b|\bfinal compensation\b/i,
  },
  {
    label: 'final-opinion framing',
    pattern: /\bfinal (?:legal |professional |case |claim )?(?:opinion|answer|assessment)\b/i,
  },
];

export const CHECKED_SURFACES = [
  {
    id: 'supported messages/**',
    description: 'All supported locale message JSON files under apps/web/src/messages.',
    roots: ['apps/web/src/messages'],
  },
  {
    id: 'checkout/registration conversion copy',
    description: 'Pricing and registration conversion copy where checkout starts.',
    files: localeFiles('pricing.json'),
  },
  {
    id: 'eligibility/Free Start result copy',
    description: 'Free Start completion, confidence, and next-step result copy.',
    files: localeFiles('freeStart.json'),
  },
  {
    id: 'recovery activation copy',
    description: 'Service and membership copy that explains when staff-led recovery starts.',
    files: [...localeFiles('servicesPage.json'), ...localeFiles('membership.json')],
  },
  {
    id: 'email-template copy',
    description: 'Member-facing email templates with commercial positioning.',
    files: ['packages/domain-communications/src/email/thank-you-letter.ts'],
  },
];

export const REQUIRED_PROTECTIVE_MESSAGES = [
  {
    surface: 'checkout/registration conversion copy',
    path: 'pricing.disclaimers.freeStart.body',
    files: localeFiles('pricing.json'),
  },
  {
    surface: 'service cards',
    path: 'servicesPage.disclaimers.freeStart.body',
    files: localeFiles('servicesPage.json'),
  },
  {
    surface: 'eligibility/Free Start result copy',
    path: 'freeStart.trust.triage.body',
    files: localeFiles('freeStart.json'),
  },
  {
    surface: 'recovery activation copy',
    path: 'servicesPage.categories.expertise.services.1.description',
    files: localeFiles('servicesPage.json'),
  },
  {
    surface: 'recovery activation copy',
    path: 'membership.disclaimers.freeStart.body',
    files: localeFiles('membership.json'),
  },
];

function localeFiles(fileName) {
  return SUPPORTED_MESSAGE_LOCALES.map(locale => `apps/web/src/messages/${locale}/${fileName}`);
}
