import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.unmock('next-intl');
import en from '@/messages/en/claims.json';
import sq from '@/messages/sq/claims.json';
import mk from '@/messages/mk/claims.json';
import sr from '@/messages/sr/claims.json';
import { ClaimInformationRequests } from './ClaimInformationRequests';

const mocks = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  fulfil: vi.fn(),
  refresh: vi.fn(),
  uploadSuccess: undefined as
    | ((evidence: { documentId: string; documentName: string; submittedAt: string }) => void)
    | undefined,
}));

vi.mock('@/actions/staff-claims/information-request', () => ({
  acknowledgeClaimInformationRequestEvidence: mocks.acknowledge,
  fulfilClaimInformationRequest: mocks.fulfil,
}));

vi.mock('@/features/member/claims/components/ClaimEvidenceUploadDialog', () => ({
  ClaimEvidenceUploadDialog: ({
    onUploadSuccess,
    trigger,
  }: {
    onUploadSuccess?: (evidence: {
      documentId: string;
      documentName: string;
      submittedAt: string;
    }) => void;
    trigger: React.ReactNode;
  }) => {
    mocks.uploadSuccess = onUploadSuccess;
    return trigger;
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
beforeEach(() => vi.clearAllMocks());
const request = {
  requestId: '12345678-1234-4234-8234-123456789012',
  requestedInformation: '<script>estimate</script>',
  explanationForMember: 'Assessment detail',
  dueAt: '2000-01-01T00:00:00.000Z',
  status: 'open' as const,
  fulfilledAt: null,
  fulfilledDocumentId: null,
  slaPosture: 'incomplete' as const,
  createdAt: '2026-09-16T10:00:00.000Z',
  evidence: [],
  progress: 'awaiting_evidence' as const,
};

const acknowledgedEvidence = {
  documentId: 'document-1',
  documentName: 'repair-estimate.pdf',
  submittedAt: '2026-09-17T09:00:00.000Z',
  acknowledgedAt: '2026-09-17T10:00:00.000Z',
};

it.each([
  { locale: 'en', messages: en },
  { locale: 'sq', messages: sq },
  { locale: 'mk', messages: mk },
  { locale: 'sr', messages: sr },
])('shows fulfilled status and no further request action in $locale', ({ locale, messages }) => {
  render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <ClaimInformationRequests
        audience="member"
        claimId="claim-1"
        requests={[
          {
            ...request,
            status: 'fulfilled',
            fulfilledAt: '2026-09-17T11:00:00.000Z',
            fulfilledDocumentId: acknowledgedEvidence.documentId,
            evidence: [acknowledgedEvidence],
            progress: 'acknowledged',
          },
        ]}
      />
    </NextIntlClientProvider>
  );
  const copy = messages.claims.informationRequests;
  expect(screen.getByTestId('information-request-status')).toHaveTextContent(copy.status.fulfilled);
  expect(screen.getByTestId('information-request-next-actor')).toHaveTextContent(
    copy.nextActor.none
  );
  expect(screen.getByTestId('information-request-next-action')).toHaveTextContent(
    copy.nextAction.none
  );
  expect(screen.getAllByText(acknowledgedEvidence.documentName)).toHaveLength(2);
  expect(screen.queryByTestId('information-request-progress')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: copy.upload })).not.toBeInTheDocument();
});

it('keeps another open request actionable after one request is fulfilled', () => {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ClaimInformationRequests
        audience="member"
        claimId="claim-1"
        requests={[
          {
            ...request,
            status: 'fulfilled',
            fulfilledAt: '2026-09-17T11:00:00.000Z',
            fulfilledDocumentId: acknowledgedEvidence.documentId,
            evidence: [acknowledgedEvidence],
            progress: 'acknowledged',
          },
          { ...request, requestId: '12345678-1234-4234-8234-123456789013' },
        ]}
      />
    </NextIntlClientProvider>
  );
  expect(
    screen.getAllByTestId('information-request-next-action').map(item => item.textContent)
  ).toEqual([
    en.claims.informationRequests.nextAction.none,
    en.claims.informationRequests.nextAction.uploadEvidence,
  ]);
  expect(
    screen.getAllByRole('button', { name: en.claims.informationRequests.upload })
  ).toHaveLength(1);
});

it('requires an explicit exact-upload review confirmation and preserves retry on failure', async () => {
  mocks.fulfil.mockRejectedValueOnce(new Error('temporary'));
  mocks.fulfil.mockResolvedValueOnce({ success: true, fulfilledAt: '2026-09-17T11:00:00.000Z' });
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ClaimInformationRequests
        audience="staff"
        canAcknowledge
        claimId="claim-1"
        requests={[{ ...request, evidence: [acknowledgedEvidence], progress: 'acknowledged' }]}
      />
    </NextIntlClientProvider>
  );
  const button = screen.getByRole('button', { name: en.claims.informationRequests.fulfil });
  expect(button).toBeDisabled();
  expect(screen.getByRole('checkbox', { name: /repair-estimate\.pdf/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox'));
  expect(button).toBeEnabled();
  fireEvent.click(button);
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Try again'));
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.getByTestId('information-request-status')).toHaveTextContent('Open');
  expect(mocks.refresh).not.toHaveBeenCalled();
  fireEvent.click(button);
  await waitFor(() =>
    expect(screen.getByTestId('information-request-status')).toHaveTextContent('Fulfilled')
  );
  expect(screen.getByTestId('information-request-status')).toHaveFocus();
  expect(screen.getByRole('status')).toHaveTextContent('Request marked fulfilled');
  expect(mocks.fulfil).toHaveBeenCalledTimes(2);
  expect(mocks.fulfil).toHaveBeenCalledWith({
    claimId: 'claim-1',
    requestId: request.requestId,
    documentId: acknowledgedEvidence.documentId,
    reviewed: true,
  });
  expect(screen.getByTestId('information-request-next-action')).toHaveTextContent(
    'No further action'
  );
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
