import { buildEmailTemplate } from './base';

export function renderPasswordResetEmail(params: { resetUrl: string }) {
  return buildEmailTemplate({
    title: 'Reset your password',
    intro:
      'We received a request to reset your password. If you requested this, use the button below to continue.',
    details: [
      'If you did not request a password reset, you can safely ignore this email.',
      'For security, this link expires soon.',
    ],
    ctaLabel: 'Reset password',
    ctaUrl: params.resetUrl,
  });
}
