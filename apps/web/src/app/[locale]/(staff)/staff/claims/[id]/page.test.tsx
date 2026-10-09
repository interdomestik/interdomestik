import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hoisted, renderPage } from './page-test-support';

// Nav destinations and section headings now share the same shipped copy, so each label is expected
// exactly once per side instead of once across the whole document.
const SQ_SECTION_LABELS = [
  'Veprimet e trajtimit',
  'Kërkesat për informacion',
  'Mesazhet',
  'Konteksti i rastit',
  'Historiku i statusit',
];

describe('StaffClaimDetailsPage', () => {
  it.each([
    ['staff-1', 'verification', true],
    ['other-staff', 'verification', false],
    ['staff-1', 'negotiation', false],
  ])(
    'shows the information form only for its assigned verifying staff (%s, %s)',
    async (staffId, status, visible) => {
      const detail = await hoisted.getStaffClaimDetailMock.getMockImplementation()!();
      hoisted.getStaffClaimDetailMock.mockResolvedValueOnce({
        ...detail,
        claim: { ...detail.claim, staffId: String(staffId), status: String(status) },
      });
      await renderPage();
      expect(screen.queryByTestId('staff-information-request-form') !== null).toBe(visible);
    }
  );

  it('localizes section labels on non-English staff claim detail routes', async () => {
    await renderPage('sq');

    expect(screen.getAllByText('Negociim')).toHaveLength(2);
    expect(screen.getByText('Rasti')).toBeInTheDocument();
    expect(screen.getByText('Statusi')).toBeInTheDocument();
    expect(screen.getByText('Përditësuar')).toBeInTheDocument();
    expect(screen.getByText('Dorëzuar')).toBeInTheDocument();
    expect(screen.getByText('Anëtari')).toBeInTheDocument();
    expect(screen.getByText('Nr. anëtarësie')).toBeInTheDocument();
    expect(screen.getByText('Kuota e rastit')).toBeInTheDocument();
    expect(screen.getByText('Përdorur këtë vit')).toBeInTheDocument();
    expect(screen.getByText('Mbetur këtë vit')).toBeInTheDocument();
    expect(screen.getByText('Kuota e planit')).toBeInTheDocument();
    expect(screen.getByText('Agjenti')).toBeInTheDocument();
    expect(screen.getByText('Shënimi i fundit i statusit')).toBeInTheDocument();
    expect(screen.getByText('Nuk ka ende shënime publike të statusit.')).toBeInTheDocument();
    // Messages now label both the section destination and the section itself.
    expect(screen.getAllByText('Mesazhet')).toHaveLength(2);
    expect(screen.getByTestId('staff-claim-workspace-back')).toHaveTextContent(
      'Kthehu te lista e rasteve'
    );
    expect(screen.getByTestId('staff-claim-workspace-nav')).toHaveAttribute(
      'aria-label',
      'Seksionet e rastit'
    );

    // One nav destination per section, scoped to the nav region.
    const nav = within(screen.getByTestId('staff-claim-workspace-nav'));
    for (const label of SQ_SECTION_LABELS) {
      expect(nav.getAllByText(label)).toHaveLength(1);
    }

    // The section headings keep their own localized copy under the shipped section markers.
    expect(
      within(screen.getByTestId('staff-claim-detail-actions')).getByText('Veprimet e trajtimit')
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('staff-claim-context')).getByText('Konteksti i rastit')
    ).toBeInTheDocument();
  });

  it.each([false, true])(
    'preserves annual matter detail when information requests fail: %s',
    async failed => {
      if (failed)
        hoisted.getInformationRequestsMock.mockRejectedValueOnce(new Error('private DB detail'));
      await renderPage('en');

      expect(screen.getByTestId('staff-claim-detail-ready')).toBeInTheDocument();
      expect(screen.getByText('Matter allowance')).toBeInTheDocument();
      expect(screen.getByText('SLA Status')).toBeInTheDocument();
      expect(screen.getByText('Running')).toBeInTheDocument();
      expect(screen.getByText('Used this year')).toBeInTheDocument();
      expect(screen.getByText('Remaining this year')).toBeInTheDocument();
      expect(screen.getByText('Plan allowance')).toBeInTheDocument();
      expect(screen.getByText('0')).toBeInTheDocument();
      expect(screen.getAllByText('2')).toHaveLength(2);
      if (failed) expect(screen.getByRole('status')).toHaveTextContent('loadError');
    }
  );

  it('renders claim messaging with internal-note controls on the canonical staff claim detail page', async () => {
    await renderPage('en');

    expect(screen.getByTestId('staff-claim-messaging-panel')).toBeInTheDocument();
    expect(hoisted.messagingPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        claimId: 'claim-1',
        allowInternal: true,
        fetchOnMount: false,
        currentUser: expect.objectContaining({
          role: 'staff',
        }),
      })
    );
  });

  it('flags a failed staff message read from the existing server result', async () => {
    const callsBefore = hoisted.getMessagesForClaimCoreMock.mock.calls.length;
    hoisted.getMessagesForClaimCoreMock.mockResolvedValueOnce({
      success: false,
      error: 'private read detail',
    } as never);

    await renderPage('en');

    expect(screen.getByTestId('staff-claim-messaging-panel')).toHaveAttribute(
      'data-initial-read-failed',
      'true'
    );
    // The failure is read off the existing server result: no second query is issued for it.
    expect(hoisted.getMessagesForClaimCoreMock.mock.calls).toHaveLength(callsBefore + 1);
    expect(screen.queryByText(/private read detail/)).not.toBeInTheDocument();
  });

  it('does not flag a successful staff message read', async () => {
    await renderPage('en');

    expect(screen.getByTestId('staff-claim-messaging-panel')).toHaveAttribute(
      'data-initial-read-failed',
      'false'
    );
  });

  it('shows a read-only operator notice for branch managers', async () => {
    const detail = await hoisted.getStaffClaimDetailMock.getMockImplementation()!();
    hoisted.getStaffClaimDetailMock.mockResolvedValueOnce({
      ...detail,
      claim: { ...detail.claim, status: 'verification', staffId: 'manager-1' },
    });
    hoisted.getSessionMock.mockResolvedValueOnce({
      user: {
        id: 'manager-1',
        tenantId: 'tenant-ks',
        role: 'branch_manager',
        branchId: 'branch-a',
      },
    });

    await renderPage('en');

    expect(screen.getByTestId('staff-claim-readonly-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-claim-messaging-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('staff-claim-action-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('staff-information-request-form')).not.toBeInTheDocument();
  });

  it('shows ordinary case evidence with canonical links to the assigned staff', async () => {
    hoisted.getAssignedStaffClaimDocumentsMock.mockResolvedValueOnce([
      {
        id: 'doc-1',
        name: 'evidence.pdf',
        fileType: 'application/pdf',
        fileSize: 1024,
        url: '/api/documents/doc-1/download',
      },
    ]);

    await renderPage('en');

    const panel = within(screen.getByTestId('staff-claim-documents'));
    expect(panel.getByText('detail.evidence')).toBeInTheDocument();
    expect(panel.getByText('evidence.pdf')).toBeInTheDocument();
    expect(panel.getByRole('link', { name: 'informationRequests.download' })).toHaveAttribute(
      'href',
      '/api/documents/doc-1/download'
    );
    expect(hoisted.getAssignedStaffClaimDocumentsMock).toHaveBeenLastCalledWith({
      claimId: 'claim-1',
      session: expect.objectContaining({
        user: expect.objectContaining({ id: 'staff-1', role: 'staff', tenantId: 'tenant-ks' }),
      }),
    });
  });

  it('shows the localized empty evidence state for the assigned staff', async () => {
    await renderPage('en');

    expect(
      within(screen.getByTestId('staff-claim-documents')).getByText('detail.documentsEmpty')
    ).toBeInTheDocument();
  });

  it('renders no evidence panel and issues no read for a wrong assignee', async () => {
    const callsBefore = hoisted.getAssignedStaffClaimDocumentsMock.mock.calls.length;
    const detail = await hoisted.getStaffClaimDetailMock.getMockImplementation()!();
    hoisted.getStaffClaimDetailMock.mockResolvedValueOnce({
      ...detail,
      claim: { ...detail.claim, staffId: 'other-staff' },
    });

    await renderPage('en');

    expect(screen.getByTestId('staff-claim-detail-ready')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-claim-documents')).not.toBeInTheDocument();
    expect(hoisted.getAssignedStaffClaimDocumentsMock.mock.calls).toHaveLength(callsBefore);
  });

  it('renders no evidence panel and issues no read for branch managers', async () => {
    const callsBefore = hoisted.getAssignedStaffClaimDocumentsMock.mock.calls.length;
    hoisted.getSessionMock.mockResolvedValueOnce({
      user: {
        id: 'manager-1',
        tenantId: 'tenant-ks',
        role: 'branch_manager',
        branchId: 'branch-a',
      },
    });

    await renderPage('en');

    expect(screen.queryByTestId('staff-claim-documents')).not.toBeInTheDocument();
    expect(hoisted.getAssignedStaffClaimDocumentsMock.mock.calls).toHaveLength(callsBefore);
  });

  it('keeps the workspace ready and exposes a truthful retry when evidence cannot load', async () => {
    hoisted.getAssignedStaffClaimDocumentsMock.mockRejectedValueOnce(
      new Error('private DB detail')
    );

    await renderPage('en');

    expect(screen.getByTestId('staff-claim-detail-ready')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-claim-documents')).not.toBeInTheDocument();
    const failure = within(screen.getByTestId('staff-claim-documents-error'));
    expect(failure.getByText('errors.generic')).toBeInTheDocument();
    expect(failure.getByRole('link', { name: 'tryAgain' })).toHaveAttribute(
      'href',
      '/en/staff/claims/claim-1'
    );
    expect(screen.queryByText('detail.documentsEmpty')).not.toBeInTheDocument();
    expect(screen.queryByText(/private DB detail/)).not.toBeInTheDocument();
  });
});
