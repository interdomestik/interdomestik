import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResponsiveSearch } from '@/hooks/use-responsive-search';
import { useSiblingNavigationCancel } from '@/hooks/use-sibling-navigation-cancel';
import { NotificationItem } from './notification-item';
import { deferred } from './notification-test-ui';

const { push, searchNavigate } = vi.hoisted(() => ({ push: vi.fn(), searchNavigate: vi.fn() }));
vi.mock('@/i18n/routing', () => ({ Link: 'a', useRouter: () => ({ push }) }));
vi.mock('@interdomestik/ui', async () => {
  const { createNotificationUiMock } = await import('./notification-test-ui');
  return createNotificationUiMock();
});

function SearchRegion() {
  const search = useResponsiveSearch({
    searchParams: new URLSearchParams(),
    pathname: '/agent/clients',
    searchKey: 'search',
    navigate: searchNavigate,
  });
  useSiblingNavigationCancel(search.cancelScheduledSearch);
  return (
    <input
      aria-label="List search"
      value={search.draft}
      disabled={search.pendingKind === 'filter'}
      onChange={event => search.editDraft(event.target.value)}
    />
  );
}

function mountAction(ack: Promise<boolean>) {
  render(
    <>
      <SearchRegion />
      <NotificationItem
        notification={{
          id: 'fixture',
          userId: 'fixture',
          type: 'new_message',
          title: 'Fixture notification',
          content: 'Fixture only',
          actionUrl: '/agent/clients?view=archived',
          isRead: false,
          createdAt: '2026-10-03T00:00:00.000Z',
        }}
        pending={false}
        blocked={false}
        onMarkAsRead={() => ack}
        onClose={vi.fn()}
        markReadLabel="Mark read"
        viewLabel="View"
      />
    </>
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'List search' }), {
    target: { value: 'ada' },
  });
  act(() => vi.advanceTimersByTime(100));
  fireEvent.click(screen.getByTestId('notification-action'));
}

describe('notification navigation versus queued search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    window.history.replaceState(null, '', '/agent/clients');
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('a failed acknowledgement leaves the queued search editable and commits it once', async () => {
    const ack = deferred<boolean>();
    mountAction(ack.promise);
    expect(screen.getByRole('textbox', { name: 'List search' })).toBeEnabled();
    await act(async () => ack.resolve(false));
    act(() => vi.advanceTimersByTime(150));
    expect(push).not.toHaveBeenCalled();
    expect(searchNavigate).toHaveBeenCalledExactlyOnceWith('search=ada');
    expect(screen.getByRole('textbox', { name: 'List search' })).toHaveValue('ada');
    expect(screen.getByRole('textbox', { name: 'List search' })).toBeEnabled();
  });

  it('a successful acknowledgement cancels only when its navigation actually starts', async () => {
    const ack = deferred<boolean>();
    mountAction(ack.promise);
    expect(screen.getByRole('textbox', { name: 'List search' })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
    await act(async () => ack.resolve(true));
    expect(push).toHaveBeenCalledExactlyOnceWith('/agent/clients?view=archived');
    expect(screen.getByRole('textbox', { name: 'List search' })).toBeDisabled();
    act(() => vi.advanceTimersByTime(250));
    expect(searchNavigate).not.toHaveBeenCalled();
  });
  it('a delayed acknowledgement cancels a newer queued draft without replaying an issued search', async () => {
    const ack = deferred<boolean>();
    mountAction(ack.promise);
    act(() => vi.advanceTimersByTime(150));
    expect(searchNavigate).toHaveBeenCalledExactlyOnceWith('search=ada');
    const input = screen.getByRole('textbox', { name: 'List search' });
    fireEvent.change(input, { target: { value: 'newer' } });
    await act(async () => ack.resolve(true));
    expect(push).toHaveBeenCalledExactlyOnceWith('/agent/clients?view=archived');
    act(() => vi.advanceTimersByTime(250));
    expect(searchNavigate).toHaveBeenCalledTimes(1);
    expect(input).toBeDisabled();
  });
});
