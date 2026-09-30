import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { hoisted, renderPage } from './page-test-support';

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
    expect(screen.getByText('Mesazhet')).toBeInTheDocument();
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
});
