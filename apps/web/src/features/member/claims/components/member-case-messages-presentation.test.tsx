import { getMessagesForClaim, type MessageWithSender } from '@/actions/messages';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemberCaseMessages } from './member-case-messages';

vi.mock('@/actions/messages', () => ({
  getMessagesForClaim: vi.fn(),
  markMessagesAsRead: vi.fn(),
  sendMessage: vi.fn(),
}));
vi.mock('next-intl', () => ({
  useLocale: () => 'sq',
  useTranslations: () => (key: string) => key,
}));

const get = vi.mocked(getMessagesForClaim);
const message = (patch: Partial<MessageWithSender> = {}): MessageWithSender => ({
  id: 'message',
  claimId: 'case-a',
  senderId: 'staff',
  content: 'Public reply',
  isInternal: false,
  readAt: null,
  createdAt: new Date('2026-09-27T10:00:00Z'),
  sender: { id: 'staff', name: 'Case team', role: 'staff', image: null },
  ...patch,
});

describe('member case messages presentation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('names the panel with a level-two heading and marks own messages apart', async () => {
    get.mockResolvedValue({
      success: true,
      messages: [message({ id: 'own', senderId: 'member', content: 'Mine' }), message()],
    });
    render(<MemberCaseMessages claimId="case-a" currentUser={{ id: 'member' }} />);

    expect(screen.getByRole('heading', { level: 2, name: 'title' })).toBeInTheDocument();
    const own = (await screen.findByText('Mine')).closest('li');
    const staff = screen.getByText('Public reply').closest('li');
    expect(own).toHaveClass('bg-[hsl(var(--primary-soft))]');
    expect(staff).not.toHaveClass('bg-[hsl(var(--primary-soft))]');
    expect(staff).toHaveTextContent('Case team');
  });

  it('shows the empty state as a bordered note only after the load settles', async () => {
    get.mockResolvedValue({ success: true, messages: [] });
    render(<MemberCaseMessages claimId="case-a" currentUser={{ id: 'member' }} />);

    const title = await screen.findByText('empty.title');
    expect(title).toHaveClass('font-semibold');
    expect(title.parentElement).toHaveClass('border-dashed');
    expect(screen.getByText('empty.description')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
