import { isAuthIssuedTemplate, type AuthIssuedTemplateType } from './auth-issued-templates';
import { rebaseApplicationDestination as rebase } from './door-destination';
import { emailSourceSchema } from './source';
import { buildEmailTemplate } from './templates/base';
import type { EmailTemplate } from './templates/types';
import { renderPaymentVerificationEmail } from './payment-verification';
import { renderThankYouLetterEmail } from './thank-you-letter';
import { renderSponsorMail } from '../sponsor-mail/render';

function refuse(code: string): never {
  console.error({ code });
  throw new Error(code);
}

/** Validate structured destinations before rendering or initializing a provider. */
export function renderEmailDelivery(
  template: EmailTemplate,
  templateType?: AuthIssuedTemplateType
): EmailTemplate {
  if (isAuthIssuedTemplate(templateType)) return template;
  if (template.source === undefined) return refuse('email_source_required');
  const result = emailSourceSchema.safeParse(template.source);
  if (!result.success) return refuse('email_source_invalid');
  const source = result.data;
  switch (source.kind) {
    case 'standard':
      return buildEmailTemplate({ ...source.params, ctaUrl: rebase(source.params.ctaUrl) });
    case 'cash':
      return renderPaymentVerificationEmail({ ...source.params, link: rebase(source.params.link) });
    case 'thank-you':
      return renderThankYouLetterEmail({
        ...source.params,
        dashboardUrl: rebase(source.params.dashboardUrl),
      });
    case 'sponsor': {
      const input = source.params;
      if (input.kind === 'sponsor_notice') {
        return renderSponsorMail({
          ...input,
          optOutUrl: rebase(input.optOutUrl),
          loginUrl: rebase(input.loginUrl),
        });
      }
      return renderSponsorMail(
        input.kind === 'membership_end_offer'
          ? { ...input, offerUrl: rebase(input.offerUrl) }
          : input
      );
    }
  }
}
