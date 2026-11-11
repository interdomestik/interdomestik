import { resolveDoorDestination } from '../email/door-destination';
import type { EmailTemplate } from '../email/templates/types';
import { DE_COPY } from './copy-de';
import { EN_COPY } from './copy-en';
import { MK_COPY } from './copy-mk';
import { SQ_COPY } from './copy-sq';
import { SR_COPY } from './copy-sr';
import type {
  SponsorMailContent,
  SponsorMailCopy,
  SponsorMailInput,
  SponsorMailLocale,
} from './types';

const COPY: Record<SponsorMailLocale, SponsorMailCopy> = {
  sq: SQ_COPY,
  en: EN_COPY,
  mk: MK_COPY,
  sr: SR_COPY,
  de: DE_COPY,
};

function contentFor(input: SponsorMailInput, copy: SponsorMailCopy): SponsorMailContent {
  switch (input.kind) {
    case 'sponsor_notice':
      return copy.messages.sponsor_notice(input);
    case 'handover_pending':
      return copy.messages.handover_pending(input);
    case 'handover_confirmed':
      return copy.messages.handover_confirmed(input);
    case 'foreign_account':
      return copy.messages.foreign_account(input);
    case 'not_eligible':
      return copy.messages.not_eligible(input);
    case 'renewal_notice':
      return copy.messages.renewal_notice(input);
    case 'membership_end_offer':
      return copy.messages.membership_end_offer(input);
    case 'opt_out_confirmation':
      return copy.messages.opt_out_confirmation(input);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderLink({ label, url }: { label: string; url: string }): string {
  const safeLabel = escapeHtml(label);
  const safeUrl = escapeHtml(url);
  return `<p><a href="${safeUrl}">${safeLabel}</a></p>`;
}

export function renderSponsorMail(input: SponsorMailInput): EmailTemplate {
  const copy = COPY[input.locale];
  const content = contentFor(input, copy);
  const recipient = input.firstName === null ? '' : ` ${input.firstName}`;
  const greeting = `${copy.greeting}${recipient},`;
  const support = `${copy.supportLabel}: ${input.supportEmail}`;
  const paragraphs = [greeting, ...content.paragraphs];
  const links = (content.links ?? []).map(link => ({
    ...link,
    url: resolveDoorDestination(link.url),
  }));

  // The shared builder requires a single CTA; these messages need zero, one or two links.
  const html = `<!doctype html>
<html lang="${escapeHtml(input.locale)}">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
  <body style="margin:0; padding:24px; font-family:Arial,sans-serif; color:#111827;">
    <main style="max-width:600px; margin:0 auto; line-height:1.6;">
      <h1>${escapeHtml(content.subject)}</h1>
      ${paragraphs.map(paragraph => `<p>${escapeHtml(paragraph)}</p>`).join('\n')}
      ${links.map(renderLink).join('\n')}
      <p>${escapeHtml(support)}</p>
    </main>
  </body>
</html>`;

  return {
    subject: content.subject,
    html,
    text: [
      content.subject,
      ...paragraphs,
      ...links.map(link => `${link.label}: ${link.url}`),
      support,
    ].join('\n\n'),
  };
}
