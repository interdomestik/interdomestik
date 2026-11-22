import { buildEmailTemplate, joinUrl } from '../email/templates/base';
import type { EmailTemplate } from '../email/templates/types';
import { CLAIM_MAIL_COPY } from './index';
import type { ClaimMailCopy, ClaimMailMessage, ClaimMailRenderArgs } from './types';

type MessageContent = { message: ClaimMailMessage; values?: Record<string, string> };

function categoryLabel(copy: ClaimMailCopy, category: string): string {
  return Object.hasOwn(copy.categories, category)
    ? (copy.categories[category] ?? copy.genericCategory)
    : copy.genericCategory;
}

function messageContent(...[kind, locale, facts]: ClaimMailRenderArgs): MessageContent {
  const copy = CLAIM_MAIL_COPY[locale];
  switch (kind) {
    case 'claim_submitted':
      return {
        message: copy.messages[kind],
        values: {
          title: facts.claimTitle,
          category: categoryLabel(copy, facts.category),
          claimId: facts.claimId,
        },
      };
    case 'claim_status_changed':
      return {
        message: copy.messages[kind],
        values: {
          title: facts.claimTitle,
          fromStatus: copy.statuses[facts.fromStatus],
          toStatus: copy.statuses[facts.toStatus],
          claimId: facts.claimId,
        },
      };
    case 'claim_recovery_decision':
      return {
        message: copy.messages[kind][facts.decision],
        values: { title: facts.claimTitle },
      };
    case 'claim_message_to_member':
      if (facts.previewRestricted) return { message: copy.messages[kind].restricted };
      return {
        message: copy.messages[kind].full,
        values: {
          title: facts.claimTitle,
          sender: facts.senderName,
          excerpt: facts.excerpt.slice(0, 160),
          claimId: facts.claimId,
        },
      };
    case 'staff_claim_submitted':
    case 'staff_member_message':
      return {
        message: copy.messages[kind],
        values: { claimNumber: facts.claimNumber, category: categoryLabel(copy, facts.category) },
      };
  }
}

export function renderClaimMail(...args: ClaimMailRenderArgs): EmailTemplate {
  const [kind, locale, facts] = args;
  const { message, values = {} } = messageContent(...args);
  const interpolate = (template: string) =>
    template.replace(/\{(\w+)\}/g, (placeholder, name: string) => values[name] ?? placeholder);
  const [intro, ...details] = message.body.split('\n').map(interpolate);

  const baseUrl = new URL(facts.baseUrl);
  if (!['http:', 'https:'].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
    throw new TypeError('Claim mail requires an HTTP(S) base URL without credentials');
  }
  baseUrl.search = '';
  baseUrl.hash = '';
  const area = kind.startsWith('staff_') ? 'staff' : 'member';
  const ctaUrl = joinUrl(
    baseUrl.href,
    `/${locale}/${area}/claims/${encodeURIComponent(facts.claimId)}`
  );

  return {
    ...buildEmailTemplate({
      title: interpolate(message.heading),
      intro,
      details,
      ctaLabel: message.cta,
      ctaUrl,
      footer: message.footer,
      locale,
    }),
    subject: interpolate(message.subject),
  };
}
