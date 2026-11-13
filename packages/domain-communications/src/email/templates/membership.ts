import type { EmailTemplate } from './types';
import { buildEmailTemplate, getAppUrl, joinUrl } from './base';

export function renderMemberWelcomeEmail(params: {
  memberName: string;
  agentName: string;
}): EmailTemplate {
  const resetUrl = joinUrl(getAppUrl(), '/auth/forgot-password');
  return buildEmailTemplate({
    title: 'Welcome to Interdomestik',
    intro: `Hi ${params.memberName}, your agent ${params.agentName} has successfully registered your membership.`,
    details: [
      'You now have access to our 24/7 emergency hotline.',
      'To access your dashboard and submit claims, please set up your account password.',
    ],
    ctaLabel: 'Set Your Password',
    ctaUrl: resetUrl,
    footer: 'If you have any questions, please contact your agent or reply to this email.',
  });
}
