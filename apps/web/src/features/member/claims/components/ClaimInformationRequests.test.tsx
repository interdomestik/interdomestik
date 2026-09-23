import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
vi.unmock('next-intl');
import en from '@/messages/en/claims.json';
import sq from '@/messages/sq/claims.json';
import mk from '@/messages/mk/claims.json';
import sr from '@/messages/sr/claims.json';
import { ClaimInformationRequests } from './ClaimInformationRequests';

const mocks = vi.hoisted(() => ({
  acknowledge: vi.fn(),
  refresh: vi.fn(),
  uploadSuccess: undefined as
    | ((evidence: { documentId: string; documentName: string; submittedAt: string }) => void)
    | undefined,
}));

vi.mock('@/actions/staff-claims/information-request', () => ({
  acknowledgeClaimInformationRequestEvidence: mocks.acknowledge,
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
const request = {
  requestId: '12345678-1234-4234-8234-123456789012',
  requestedInformation: '<script>estimate</script>',
  explanationForMember: 'Assessment detail',
  dueAt: '2000-01-01T00:00:00.000Z',
  slaPosture: 'incomplete' as const,
  createdAt: '2026-09-16T10:00:00.000Z',
  evidence: [],
  progress: 'awaiting_evidence' as const,
};
it('reports a failed read without inventing an empty request list', () => {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ClaimInformationRequests audience="member" claimId="claim-1" requests={null} />
    </NextIntlClientProvider>
  );
  expect(screen.getByRole('status')).toHaveTextContent('could not be loaded');
  expect(screen.queryByTestId('claim-information-request')).not.toBeInTheDocument();
});
it.each([
  { locale: 'en', messages: en },
  { locale: 'sq', messages: sq },
  { locale: 'mk', messages: mk },
  { locale: 'sr', messages: sr },
])('renders safe identifiable cards in $locale', ({ locale, messages }) => {
  const { container } = render(
    <NextIntlClientProvider locale={locale} messages={messages} timeZone="UTC">
      <ClaimInformationRequests audience="member" claimId="claim-1" requests={[request]} />
    </NextIntlClientProvider>
  );
  expect(
    screen.getByRole('region', { name: messages.claims.informationRequests.title })
  ).toBeInTheDocument();
  expect(screen.getByText(request.requestId)).toBeInTheDocument();
  expect(screen.getByText(request.requestedInformation)).toBeInTheDocument();
  expect(container.querySelector('script')).toBeNull();
  expect(container.querySelector('time')).toHaveAttribute('datetime', request.dueAt);
  expect(container.querySelector('time')).toHaveTextContent('00:00 UTC');
  expect(
    screen.getByRole('button', { name: messages.claims.informationRequests.upload })
  ).toBeInTheDocument();
});
it('renders the same explicit UTC deadline in different runtime timezones', () => {
  const renderDeadline = (timeZone: string) => {
    vi.stubEnv('TZ', timeZone);
    const { container, unmount } = render(
      <NextIntlClientProvider locale="sq" messages={sq} timeZone={timeZone}>
        <ClaimInformationRequests audience="member" claimId="claim-1" requests={[request]} />
      </NextIntlClientProvider>
    );
    const text = container.querySelector('time')?.textContent;
    unmount();
    return text;
  };
  const serverDeadline = renderDeadline('UTC');
  expect(serverDeadline).toContain('00:00 UTC');
  expect(renderDeadline('Europe/Berlin')).toBe(serverDeadline);
  expect(renderDeadline('America/Los_Angeles')).toBe(serverDeadline);
});
it('does not invent a request in the empty state', () => {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ClaimInformationRequests audience="member" claimId="claim-1" requests={[]} />
    </NextIntlClientProvider>
  );
  expect(container).toBeEmptyDOMElement();
});

it('shows a completed request upload immediately while the route refreshes', async () => {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ClaimInformationRequests audience="member" claimId="claim-1" requests={[request]} />
    </NextIntlClientProvider>
  );

  act(() => {
    mocks.uploadSuccess?.({
      documentId: 'document-1',
      documentName: 'repair-estimate.pdf',
      submittedAt: '2026-09-17T09:00:00.000Z',
    });
  });

  await waitFor(() => {
    expect(screen.getByText('repair-estimate.pdf')).toBeInTheDocument();
    expect(screen.getByText('Evidence submitted')).toBeInTheDocument();
  });
});

it('shows request-linked evidence and lets assigned staff acknowledge it once', async () => {
  mocks.acknowledge.mockResolvedValue({
    success: true,
    acknowledgedAt: '2026-09-17T10:00:00.000Z',
  });
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ClaimInformationRequests
        audience="staff"
        canAcknowledge
        claimId="claim-1"
        requests={[
          {
            ...request,
            progress: 'submitted',
            evidence: [
              {
                documentId: 'document-1',
                documentName: 'repair-estimate.pdf',
                submittedAt: '2026-09-17T09:00:00.000Z',
                acknowledgedAt: null,
              },
            ],
          },
        ]}
      />
    </NextIntlClientProvider>
  );

  expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
    'href',
    '/api/documents/document-1/download'
  );
  fireEvent.click(screen.getByRole('button', { name: 'Acknowledge evidence' }));
  await waitFor(() => {
    expect(mocks.acknowledge).toHaveBeenCalledWith({
      claimId: 'claim-1',
      documentId: 'document-1',
      requestId: request.requestId,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Evidence acknowledged.');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
