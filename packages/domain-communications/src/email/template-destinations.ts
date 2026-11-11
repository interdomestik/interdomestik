import { rebaseApplicationDestination } from './door-destination';
import { isAuthIssuedTemplate, type AuthIssuedTemplateType } from './auth-issued-templates';
import { escapeHtml } from './templates/base';
import type { EmailTemplate } from './templates/types';

function decodeHtml(value: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    quot: '"',
    apos: "'",
    lt: '<',
    gt: '>',
  };
  return value.replaceAll(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/giu, (_, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()];
    const numeric = entity.toLowerCase();
    const code = numeric.startsWith('#x')
      ? Number.parseInt(numeric.slice(2), 16)
      : Number(numeric.slice(1));
    return String.fromCodePoint(code);
  });
}

function rebaseTextCta(text: string, label: string, destination: string, subject: string): string {
  // All shared, sponsor and thank-you CTAs occupy their own paragraph after body content.
  // Select the final slot so even a quoted, identical CTA line in the body stays untouched.
  let prefix = `\n\n${label}: `;
  let start = text.lastIndexOf(prefix);
  if (start < 0 && text.startsWith(`${label}: `)) {
    prefix = `${label}: `;
    start = 0;
  }
  // The cash-payment template has one inline, trailing link slot instead.
  if (
    start < 0 &&
    label === 'View in Dashboard' &&
    subject.startsWith('Payment Verification Update: ')
  ) {
    prefix = ' Link: ';
    start = text.lastIndexOf(prefix);
  }
  if (start < 0) throw new Error('Missing email text CTA');
  start += prefix.length;
  const newline = text.indexOf('\n', start);
  const end = newline < 0 ? text.length : newline;
  const textDestination = rebaseApplicationDestination(text.slice(start, end));
  if (textDestination !== destination) throw new Error('Inconsistent email CTA destinations');
  return `${text.slice(0, start)}${textDestination}${text.slice(end)}`;
}

/** Recheck rendered/queued application links before any provider is initialized. */
export function resolveEmailDestinations<T extends EmailTemplate>(
  template: T,
  templateType?: AuthIssuedTemplateType
): T {
  if (isAuthIssuedTemplate(templateType)) return template;
  let text = template.text;
  // Templates generate plain-label anchors; escaped body content is never a link slot.
  const html = template.html.replaceAll(/<a\b[^<>]*>[^<>]*<\/a\s*>/giu, anchor => {
    return anchor.replace(
      /(\bhref\s*=\s*)(["'])([^"'<>]*)\2/iu,
      (attribute, prefix: string, quote: string, value: string) => {
        const link = decodeHtml(value);
        if (/^(?:mailto:|tel:|#)/iu.test(link)) return attribute;
        const destination = rebaseApplicationDestination(link);
        const label = decodeHtml(
          anchor.slice(anchor.indexOf('>') + 1, anchor.lastIndexOf('<')).trim()
        );
        text = rebaseTextCta(text, label, destination, template.subject);
        return `${prefix}${quote}${escapeHtml(destination)}${quote}`;
      }
    );
  });
  return { ...template, html, text };
}
