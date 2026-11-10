import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { RestrictedRead, ClaimMessageMetadata } from './get-claim-message-metadata';
const mocks = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('./get-claim-message-metadata', () => ({ getClaimMessageMetadata: mocks.read }));
vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
  getFormatter: () => Promise.resolve({ dateTime: (date: Date) => date.toISOString() }),
}));
vi.mock('./restricted-communication-notice', () => ({
  RestrictedCommunicationNotice: ({ state }: { state?: string }) => (
    <div>{state ?? 'restriction'}</div>
  ),
}));
import { ClaimMessageSummary } from './claim-message-summary';
const authority = {} as TenantAuthority;
beforeEach(() => vi.clearAllMocks());
describe('allowlisted summary presentation', () => {
  it.each(['unavailable', 'failed'] as const)(
    'keeps %s distinct from empty and hides DTO fields',
    async kind => {
      mocks.read.mockResolvedValue({ kind });
      render(await ClaimMessageSummary({ claimId: 'claim', authority }));
      expect(screen.getByText(kind)).toBeInTheDocument();
      expect(screen.queryByText('empty')).not.toBeInTheDocument();
      expect(screen.queryByTestId('claim-message-summary-count')).not.toBeInTheDocument();
    }
  );
  it('renders authorized empty counts and no timestamp truthfully', async () => {
    mocks.read.mockResolvedValue({
      kind: 'ok',
      data: { count: 0, lastMessageAt: null, awaitingReply: false },
    });
    render(await ClaimMessageSummary({ claimId: 'claim', authority }));
    expect(screen.getByText('empty')).toBeInTheDocument();
    expect(screen.getByTestId('claim-message-summary-count')).toHaveTextContent('0');
    expect(screen.getByTestId('claim-message-summary-last')).toHaveTextContent('noTimestamp');
    expect(screen.getByTestId('claim-message-summary-awaiting')).toHaveTextContent('no');
  });
  it('renders only the summary values without a composer or hidden sender/content props', async () => {
    const result: RestrictedRead<ClaimMessageMetadata> = {
      kind: 'ok',
      data: {
        count: 5,
        lastMessageAt: '2026-11-01T00:00:00.000Z',
        awaitingReply: true,
      },
    };
    mocks.read.mockResolvedValue(result);
    const { container } = render(await ClaimMessageSummary({ claimId: 'claim', authority }));
    expect(screen.getByTestId('claim-message-summary-count')).toHaveTextContent('5');
    expect(screen.getByTestId('claim-message-summary-awaiting')).toHaveTextContent('yes');
    expect(container.querySelector('textarea')).toBeNull();
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith({ claimId: 'claim', authority });
  });
});
