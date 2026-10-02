import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { describe, expect, it, vi } from 'vitest';
vi.unmock('next-intl');
import claimsEn from '@/messages/en/claims.json';
import claimsSq from '@/messages/sq/claims.json';
import claimsMk from '@/messages/mk/claims.json';
import claimsSr from '@/messages/sr/claims.json';
import trackingEn from '@/messages/en/claims-tracking.json';
import trackingSq from '@/messages/sq/claims-tracking.json';
import trackingMk from '@/messages/mk/claims-tracking.json';
import trackingSr from '@/messages/sr/claims-tracking.json';
import { deriveCaseCompanionNextStep } from '@interdomestik/domain-claims';
import { CaseCompanionNextStepCard } from './CaseCompanionNextStepCard';
import { ClaimInformationRequests, request } from './information-request-component-test-support';

// The generic companion card only translates derived keys, so this mounts the real
// projection next to the request card to prove the two never claim the same duty.
const verificationStep = deriveCaseCompanionNextStep({ status: 'verification' });

const locales = [
  { locale: 'en', tracking: trackingEn, claims: claimsEn },
  { locale: 'sq', tracking: trackingSq, claims: claimsSq },
  { locale: 'mk', tracking: trackingMk, claims: claimsMk },
  { locale: 'sr', tracking: trackingSr, claims: claimsSr },
] as const;

type LocaleCase = (typeof locales)[number];
type MemberRequests = Parameters<typeof ClaimInformationRequests>[0]['requests'];

function renderVerificationDetail(localeCase: LocaleCase, requests: MemberRequests) {
  return render(
    <NextIntlClientProvider
      locale={localeCase.locale}
      messages={{ ...localeCase.tracking, ...localeCase.claims }}
      timeZone="UTC"
    >
      <CaseCompanionNextStepCard nextStep={verificationStep} />
      <ClaimInformationRequests audience="member" claimId="claim-1" requests={requests} />
    </NextIntlClientProvider>
  );
}

const companionCopy = (localeCase: LocaleCase) =>
  localeCase.tracking['claims-tracking'].case_companion;
const requestCopy = (localeCase: LocaleCase) => localeCase.claims.claims.informationRequests;

describe('member verification detail guidance', () => {
  it.each(locales)('stays neutral without any information request in $locale', localeCase => {
    renderVerificationDetail(localeCase, []);
    const copy = companionCopy(localeCase);

    expect(screen.getByTestId('member-claim-next-step-owner')).toHaveTextContent(
      copy.owner.interdomestik
    );
    expect(screen.getByTestId('member-claim-next-step-status')).toHaveTextContent(
      copy.status_sentence.verification
    );
    expect(screen.getByTestId('member-claim-next-step-action')).toHaveTextContent(
      copy.action.review_case_details
    );
    expect(screen.getByTestId('member-claim-next-step-expectation')).toHaveTextContent(
      copy.awaiting_date.not_recorded
    );

    const companion = screen.getByTestId('member-claim-case-companion-next-step');
    expect(companion).not.toHaveTextContent(copy.action.upload_evidence);
    expect(companion).not.toHaveTextContent(copy.action.no_action);
    expect(companion).not.toHaveTextContent(copy.awaiting_date.member_action_required);
    expect(screen.queryByTestId('claim-information-requests')).not.toBeInTheDocument();
  });

  it.each(locales)('keeps the open upload duty in the request card in $locale', localeCase => {
    renderVerificationDetail(localeCase, [request]);
    const copy = companionCopy(localeCase);
    const requests = requestCopy(localeCase);

    expect(screen.getByTestId('member-claim-next-step-action')).toHaveTextContent(
      copy.action.review_case_details
    );
    expect(screen.getByTestId('member-claim-case-companion-next-step')).not.toHaveTextContent(
      copy.action.upload_evidence
    );
    expect(screen.getByTestId('claim-information-request')).toContainElement(
      screen.getByRole('button', { name: requests.upload })
    );
    expect(screen.getByTestId('information-request-next-actor')).toHaveTextContent(
      requests.nextActor.member
    );
    expect(screen.getByTestId('information-request-next-action')).toHaveTextContent(
      requests.nextAction.uploadEvidence
    );
  });

  it.each(locales)('stays upload-free once a request is fulfilled in $locale', localeCase => {
    renderVerificationDetail(localeCase, [
      {
        ...request,
        status: 'fulfilled',
        fulfilledAt: '2026-09-18T11:00:00.000Z',
        fulfilledDocumentId: 'document-1',
        progress: 'acknowledged',
        evidence: [
          {
            documentId: 'document-1',
            documentName: 'repair-estimate.pdf',
            submittedAt: '2026-09-17T09:00:00.000Z',
            acknowledgedAt: '2026-09-17T10:00:00.000Z',
          },
        ],
      },
    ]);
    const copy = companionCopy(localeCase);
    const requests = requestCopy(localeCase);

    expect(screen.getByTestId('member-claim-next-step-status')).toHaveTextContent(
      copy.status_sentence.verification
    );
    expect(screen.getByTestId('member-claim-next-step-action')).toHaveTextContent(
      copy.action.review_case_details
    );
    expect(screen.getByTestId('information-request-status')).toHaveTextContent(
      requests.status.fulfilled
    );
    expect(screen.queryByRole('button', { name: requests.upload })).not.toBeInTheDocument();
    expect(screen.getByTestId('member-claim-case-companion-next-step')).not.toHaveTextContent(
      copy.action.upload_evidence
    );
  });
});
