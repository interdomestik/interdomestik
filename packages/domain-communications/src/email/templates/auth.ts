import { buildEmailTemplate } from './base';

// One email serves "forgot password" and a newly converted member's first password (ACQ-2b2,
// owner decision B), so the copy never claims the reader asked for it.
export function renderPasswordResetEmail(params: { resetUrl: string }) {
  return buildEmailTemplate({
    title: 'Set your password',
    intro:
      'Use the button below to set a new password for your Interdomestik account. If your membership was just created, this is how you sign in for the first time.',
    details: [
      'If you did not expect this email, you can safely ignore it; your password stays unchanged.',
      'For security, this link expires in 1 hour.',
    ],
    ctaLabel: 'Set password',
    ctaUrl: params.resetUrl,
  });
}
