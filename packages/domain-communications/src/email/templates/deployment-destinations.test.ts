import { afterEach, describe, expect, it, vi } from 'vitest';
import * as templates from './index';
import { stubDeploymentOrigin } from '../../deployment-origin.test-support';
import type { EmailTemplate } from './types';

const claim = {
  claimId: 'claim_A-42',
  claimTitle: 'Claim',
  category: 'Vehicle',
  agentName: 'Agent',
  oldStatus: 'submitted',
  newStatus: 'verification',
  senderName: 'Sender',
  messagePreview: 'Message',
};
const payment = {
  memberName: 'Member',
  planName: 'Family',
  gracePeriodDays: 14,
  daysRemaining: 7,
  gracePeriodEndDate: '2026-12-01',
};

afterEach(() => vi.unstubAllEnvs());

describe('communication application destinations', () => {
  it.each([
    ['production', 'https://ida.interdomestik.com'],
    ['staging', 'https://staging.interdomestik.com'],
    ['local', 'http://ida.localhost:3310'],
    ['local', 'https://ida.127.0.0.1.nip.io:3443'],
  ])(
    'uses the %s door for every CTA family without changing its path/token',
    (environment, door) => {
      stubDeploymentOrigin(environment, door);
      for (const tenant of ['tenant_ks', 'tenant_mk', 'tenant_al', 'pilot-mk']) {
        for (const locale of ['sq', 'en', 'sr', 'mk', 'de']) {
          const pairs: [EmailTemplate, string][] = [
            [templates.renderClaimSubmittedEmail(claim), '/member/claims/claim_A-42'],
            [templates.renderClaimAssignedEmail(claim), '/member/claims/claim_A-42'],
            [templates.renderStatusChangedEmail(claim), '/member/claims/claim_A-42'],
            [templates.renderNewMessageEmail(claim), '/member/claims/claim_A-42'],
            [
              templates.renderMemberWelcomeEmail({ memberName: tenant, agentName: 'Agent' }),
              '/auth/forgot-password',
            ],
            [templates.renderPaymentFailedEmail({ ...payment, locale }), '/member/membership'],
            [
              templates.renderPaymentReminderEmail({ ...payment, locale, accessContinues: true }),
              '/member/membership',
            ],
            [
              templates.renderPaymentFinalWarningEmail({ ...payment, locale }),
              '/member/membership',
            ],
            [
              templates.renderNpsSurveyEmail({ name: tenant, token: 'token_Ab-12' }),
              '/nps/token_Ab-12',
            ],
            [templates.renderWelcomeEmail({ name: tenant }), '/member'],
            [templates.renderOnboardingEmail({ name: tenant }), '/member/membership/card'],
            [templates.renderCheckinEmail({ name: tenant }), '/member'],
            [templates.renderEngagementDay30Email({ name: tenant }), '/member'],
            [templates.renderEngagementDay60Email({ name: tenant }), '/member/membership'],
            [templates.renderEngagementDay90Email({ name: tenant }), '/member'],
            [
              templates.renderNewsletterEmail({
                month: 'May',
                hero: { title: 'News', text: 'News' },
              }),
              '/member',
            ],
            [templates.renderSeasonalEmail({ season: 'winter', name: tenant }), '/member'],
            [templates.renderSeasonalEmail({ season: 'summer', name: tenant }), '/member'],
          ];
          for (const [mail, path] of pairs) {
            expect(mail.html.match(/href="([^"]+)"/)?.[1]).toBe(`${door}${path}`);
            expect(mail.text).toContain(`${door}${path}`);
          }
        }
      }
    }
  );
});
