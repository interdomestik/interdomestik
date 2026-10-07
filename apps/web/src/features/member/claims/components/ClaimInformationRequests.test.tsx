import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { expect, it, vi } from 'vitest';
vi.unmock('next-intl');
import en from '@/messages/en/claims.json';
import sq from '@/messages/sq/claims.json';
import mk from '@/messages/mk/claims.json';
import sr from '@/messages/sr/claims.json';
import {
  ClaimInformationRequests,
  mocks,
  request,
} from './information-request-component-test-support';

it('reports a failed read without inventing an empty request list', () => {
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <ClaimInformationRequests audience="member" claimId="claim-1" requests={null} />
    </NextIntlClientProvider>
  );
  expect(screen.getByRole('status')).toHaveTextContent('could not be loaded');
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
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
  expect(screen.getByTestId('information-request-status')).toHaveTextContent(
    messages.claims.informationRequests.status.open
  );
  expect(screen.getByTestId('information-request-next-actor')).toHaveTextContent(
    messages.claims.informationRequests.nextActor.member
  );
  expect(screen.getByTestId('information-request-next-action')).toHaveTextContent(
    messages.claims.informationRequests.nextAction.uploadEvidence
  );
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

it.each([
  {
    progress: 'awaiting_evidence' as const,
    actor: 'member' as const,
    action: 'uploadEvidence' as const,
  },
  {
    progress: 'submitted' as const,
    actor: 'assignedStaff' as const,
    action: 'reviewEvidence' as const,
  },
  {
    progress: 'acknowledged' as const,
    actor: 'assignedStaff' as const,
    action: 'reviewRequest' as const,
  },
])(
  'shows the same open request and next actor on member and staff views for $progress',
  ({ progress, actor, action }) => {
    const evidence =
      progress === 'awaiting_evidence'
        ? []
        : [
            {
              documentId: 'document-1',
              documentName: 'estimate.pdf',
              submittedAt: '2026-09-17T09:00:00.000Z',
              acknowledgedAt: progress === 'acknowledged' ? '2026-09-17T10:00:00.000Z' : null,
            },
          ];
    for (const audience of ['member', 'staff'] as const) {
      const { unmount } = render(
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          <ClaimInformationRequests
            audience={audience}
            claimId="claim-1"
            requests={[{ ...request, evidence, progress }]}
          />
        </NextIntlClientProvider>
      );
      expect(screen.getByText(request.requestId)).toBeInTheDocument();
      expect(screen.getByTestId('information-request-status')).toHaveTextContent(
        en.claims.informationRequests.status.open
      );
      expect(screen.getByTestId('information-request-next-actor')).toHaveTextContent(
        en.claims.informationRequests.nextActor[actor]
      );
      expect(screen.getByTestId('information-request-next-action')).toHaveTextContent(
        en.claims.informationRequests.nextAction[action]
      );
      expect(screen.getByText(en.claims.informationRequests.ownerLabel)).toBeInTheDocument();
      expect(
        screen.getByText(request.requestId).closest('section')?.querySelector('time')
      ).toHaveAttribute('datetime', request.dueAt);
      unmount();
    }
  }
);

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
    expect(screen.getByTestId('information-request-status')).toHaveTextContent('Open');
    expect(screen.getByTestId('information-request-next-actor')).toHaveTextContent(
      'Assigned case staff'
    );
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

it('keeps the request visible and shows retry feedback when acknowledgement rejects', async () => {
  mocks.refresh.mockClear();
  mocks.acknowledge.mockRejectedValueOnce(new Error('temporary failure'));
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

  fireEvent.click(screen.getByRole('button', { name: 'Acknowledge evidence' }));

  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent(
      'Evidence could not be acknowledged. Refresh and try again.'
    );
  });
  expect(screen.getByText('repair-estimate.pdf')).toBeInTheDocument();
  expect(mocks.refresh).not.toHaveBeenCalled();
});
