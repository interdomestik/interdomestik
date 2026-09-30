import { screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { hoisted, renderPage } from './page-test-support';

it('keeps the uncertain save visible in ordered history after a newer public update', async () => {
  hoisted.getPublicStatusHistoryCoreMock.mockResolvedValueOnce([
    {
      id: 'newer',
      note: 'Intervening update',
      toStatus: 'verification',
      createdAt: new Date('2026-09-30T12:01:00Z'),
    },
    {
      id: 'original',
      note: 'Original uncertain save',
      toStatus: 'verification',
      createdAt: new Date('2026-09-30T12:00:00Z'),
    },
    {
      id: 'no-note',
      note: null,
      toStatus: 'submitted',
      createdAt: new Date('2026-09-30T11:00:00Z'),
    },
  ]);
  await renderPage();
  expect(screen.getByTestId('staff-claim-detail-note')).toHaveTextContent('Intervening update');
  expect(screen.getByTestId('staff-claim-detail-note')).not.toHaveTextContent(
    'Original uncertain save'
  );
  const entries = screen.getAllByTestId('staff-status-history-entry');
  expect(entries).toHaveLength(3);
  expect(entries[0]).toHaveTextContent('Intervening update');
  expect(entries[1]).toHaveTextContent('Original uncertain save');
  expect(entries[2]).toHaveTextContent('submitted');
  expect(screen.getByTestId('staff-status-history')).toHaveAttribute('id', 'staff-status-history');
  expect(hoisted.getPublicStatusHistoryCoreMock).toHaveBeenCalledWith({
    claimId: 'claim-1',
    tenantId: 'tenant-ks',
  });
});

it('retains the latest note when the newest public transition has no note', async () => {
  hoisted.getPublicStatusHistoryCoreMock.mockResolvedValueOnce([
    {
      id: 'newer',
      note: null,
      toStatus: 'verification',
      createdAt: new Date('2026-09-30T12:01:00Z'),
    },
    {
      id: 'original',
      note: 'Earlier public note',
      toStatus: 'submitted',
      createdAt: new Date('2026-09-30T12:00:00Z'),
    },
  ]);
  await renderPage();
  expect(screen.getByTestId('staff-claim-detail-note')).toHaveTextContent('Earlier public note');
  expect(screen.getAllByTestId('staff-status-history-entry')).toHaveLength(2);
});

it('does not read public history when claim authorization fails', async () => {
  const previousReads = hoisted.getPublicStatusHistoryCoreMock.mock.calls.length;
  hoisted.getStaffClaimDetailMock.mockResolvedValueOnce(null as never);
  await expect(renderPage()).rejects.toThrow('notFound');
  expect(hoisted.getPublicStatusHistoryCoreMock).toHaveBeenCalledTimes(previousReads);
});
