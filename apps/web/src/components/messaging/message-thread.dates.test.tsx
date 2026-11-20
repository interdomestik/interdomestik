import { describe, expect, it, vi } from 'vitest';
vi.unmock('next-intl');
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import sqCommon from '../../messages/sq/common.json';
import sqMessaging from '../../messages/sq/messaging.json';
import { MessageThread } from './message-thread';

const viewer = { id: 'user-1', name: 'User', image: null, role: 'user' };
const message = (createdAt: string) => ({
  id: `msg-${createdAt}`,
  claimId: 'claim-1',
  senderId: 'user-2',
  content: 'QA2 message',
  isInternal: false,
  readAt: null,
  createdAt: new Date(createdAt),
  sender: { id: 'user-2', name: 'Staff', image: null, role: 'staff' },
});

function renderSq(createdAt: string[]): void {
  render(
    <NextIntlClientProvider locale="sq" messages={{ ...sqCommon, ...sqMessaging }}>
      <MessageThread messages={createdAt.map(message)} currentUser={viewer} />
    </NextIntlClientProvider>
  );
}

describe('MessageThread pilot-zone dates', () => {
  it('shows a local 24-hour time without a UTC suffix', () => {
    renderSq(['2026-11-12T22:53:00Z']);
    expect(screen.getByText('12.11.2026')).toBeInTheDocument();
    expect(screen.getByText('23:53')).toBeInTheDocument();
    expect(screen.queryByText(/UTC/)).not.toBeInTheDocument();
  });

  it('groups a late-evening UTC message under the next pilot-zone day', () => {
    renderSq(['2026-11-12T22:00:00Z', '2026-11-12T23:30:00Z']);
    expect(screen.getByText('12.11.2026')).toBeInTheDocument();
    expect(screen.getByText('13.11.2026')).toBeInTheDocument();
    expect(screen.getByText('00:30')).toBeInTheDocument();
  });
});
