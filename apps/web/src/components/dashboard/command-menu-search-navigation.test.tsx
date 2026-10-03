import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResponsiveSearch } from '@/hooks/use-responsive-search';
import { useSiblingNavigationCancel } from '@/hooks/use-sibling-navigation-cancel';
import { CommandMenuTrigger } from './command-menu-trigger';

const { push, params } = vi.hoisted(() => ({ push: vi.fn(), params: new URLSearchParams() }));
vi.mock('next/navigation', () => ({
  usePathname: () => '/agent/members',
  useRouter: () => ({ push }),
  useSearchParams: () => params,
}));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

function SearchRegion() {
  const search = useResponsiveSearch({
    searchParams: params,
    pathname: '/agent/members',
    searchKey: 'q',
    navigate: query => push(`/agent/members?${query}`),
  });
  useSiblingNavigationCancel(() => search.cancelScheduledSearch());
  return (
    <input
      aria-label="Local list search"
      value={search.draft}
      onChange={event => search.editDraft(event.target.value)}
    />
  );
}

describe('command menu versus queued automatic search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    push.mockReset();
    window.history.replaceState(null, '', '/agent/members');
  });
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('an explicit command submit wins before its URL reaches the automatic search', () => {
    render(
      <>
        <SearchRegion />
        <CommandMenuTrigger />
      </>
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Local list search' }), {
      target: { value: 'abandoned' },
    });
    act(() => vi.advanceTimersByTime(100));
    fireEvent.click(screen.getByRole('button', { name: /search_placeholder/ }));
    const dialog = within(screen.getByRole('dialog'));
    const commandInput = dialog.getByPlaceholderText('search_placeholder');
    fireEvent.change(commandInput, { target: { value: 'command' } });
    fireEvent.submit(commandInput.closest('form')!);
    expect(push).toHaveBeenCalledExactlyOnceWith('/agent/members?q=command');
    act(() => vi.advanceTimersByTime(250));
    expect(push).toHaveBeenCalledTimes(1);
  });
});
