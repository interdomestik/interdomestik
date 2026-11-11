import { rebaseApplicationDestination } from './door-destination';
import { isAuthIssuedTemplate, type AuthIssuedTemplateType } from './auth-issued-templates';
import { escapeHtml } from './templates/base';
import type { EmailTemplate } from './templates/types';

function decodeHtmlUrl(value: string): string {
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

/** Recheck rendered/queued application links before any provider is initialized. */
export function resolveEmailDestinations<T extends EmailTemplate>(
  template: T,
  templateType?: AuthIssuedTemplateType
): T {
  if (isAuthIssuedTemplate(templateType)) return template;
  // Generated templates quote hrefs. Image sources and mail/telephone links are not app destinations.
  const html = template.html.replaceAll(
    /(\bhref\s*=\s*)(["'])([^"'<>]*)\2/giu,
    (attribute, prefix: string, quote: string, value: string) => {
      const link = decodeHtmlUrl(value);
      if (/^(?:mailto:|tel:|#)/iu.test(link)) return attribute;
      const destination = rebaseApplicationDestination(link);
      return `${prefix}${quote}${escapeHtml(destination)}${quote}`;
    }
  );
  const text = template.text.replaceAll(/https?:\/\/[^\s<>"']+/giu, link =>
    rebaseApplicationDestination(link)
  );
  return { ...template, html, text };
}
