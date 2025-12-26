import type { EmailTemplate, TemplateOptions } from './types';

export const DEFAULT_APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || 'Interdomestik';
export const DEFAULT_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function joinUrl(baseUrl: string, path: string) {
  const trimmedBase = baseUrl.replace(/\/$/, '');
  const trimmedPath = path.replace(/^\//, '');
  return `${trimmedBase}/${trimmedPath}`;
}

export function buildEmailTemplate({
  title,
  intro,
  details,
  ctaLabel,
  ctaUrl,
  footer,
}: TemplateOptions): EmailTemplate {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeCtaLabel = escapeHtml(ctaLabel);
  const safeCtaUrl = escapeHtml(ctaUrl);
  const safeFooter = escapeHtml(footer || `${DEFAULT_APP_NAME} Team`);

  const detailsHtml = (details || [])
    .map(line => `<li style="margin: 4px 0;">${escapeHtml(line)}</li>`)
    .join('');

  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="margin:0; padding:0; background:#f7f7f8; font-family: Arial, sans-serif; color:#111827;">
    <div style="max-width:600px; margin:0 auto; padding:32px 20px;">
      <div style="background:#ffffff; border-radius:16px; padding:28px; box-shadow:0 4px 20px rgba(15, 23, 42, 0.06);">
        <h1 style="margin:0 0 12px; font-size:22px; font-weight:700;">${safeTitle}</h1>
        <p style="margin:0 0 18px; font-size:15px; line-height:1.6; color:#374151;">${safeIntro}</p>
        ${detailsHtml ? `<ul style="margin:0 0 20px; padding-left:18px; font-size:14px; color:#4b5563;">${detailsHtml}</ul>` : ''}
        <a href="${safeCtaUrl}" style="display:inline-block; background:#0f766e; color:#ffffff; text-decoration:none; padding:12px 18px; border-radius:10px; font-size:14px; font-weight:600;">
          ${safeCtaLabel}
        </a>
      </div>
      <p style="margin:16px 0 0; font-size:12px; color:#6b7280; text-align:center;">${safeFooter}</p>
    </div>
  </body>
</html>`;

  const textParts = [title, intro];
  if (details?.length) {
    textParts.push(details.join('\n'));
  }
  textParts.push(`${ctaLabel}: ${ctaUrl}`);
  textParts.push(footer || `${DEFAULT_APP_NAME} Team`);

  return {
    subject: title,
    html,
    text: textParts.join('\n\n'),
  };
}
