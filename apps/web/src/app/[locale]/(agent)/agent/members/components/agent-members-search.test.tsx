import { notifySiblingNavigation } from '@/hooks/use-sibling-navigation-cancel';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { advance, setupSearchHarness } from '@/hooks/responsive-search-test-support';
import { AgentMembersSearch } from './agent-members-search';

const { pathnameMock, pushMock, replaceMock, searchParamsMock } = vi.hoisted(() => ({
  pathnameMock: vi.fn(() => '/agent/members'),
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  searchParamsMock: vi.fn(() => new URLSearchParams()),
}));

vi.mock('@/i18n/routing', () => ({
  usePathname: () => pathnameMock(),
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParamsMock(),
}));

vi.mock('@interdomestik/ui', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

const SEARCH_COMMIT_DELAY_MS = 250;

function searchInput(): HTMLInputElement {
  return screen.getByTestId<HTMLInputElement>('agent-members-search-input');
}

function type(value: string): void {
  fireEvent.change(searchInput(), { target: { value } });
}

// This adapter has no Enter handler: typing is what commits, through the
// shared coalesced policy. The param rules under test are the existing ones.
describe('AgentMembersSearch', () => {
  setupSearchHarness();

  beforeEach(() => {
    vi.clearAllMocks();
    pathnameMock.mockReturnValue('/agent/members');
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  it('commits the trimmed term once per typing burst as a relative replace', () => {
    render(<AgentMembersSearch />);

    type('  ada');
    advance(SEARCH_COMMIT_DELAY_MS - 50);
    type('  ada  ');
    advance(SEARCH_COMMIT_DELAY_MS - 50);
    expect(replaceMock).not.toHaveBeenCalled();

    advance(50);

    // One argument only: the existing relative href and scroll default.
    expect(replaceMock.mock.calls).toEqual([['?q=ada']]);
    expect(pushMock).not.toHaveBeenCalled();
    // The raw text stays the owner's until an external url adoption replaces it.
    expect(searchInput().value).toBe('  ada  ');
  });

  it.each([
    [
      'preserves unrelated params and never resets the page',
      'tenantId=tenant_ks&page=3',
      'ada',
      '?tenantId=tenant_ks&page=3&q=ada',
    ],
    ['clears the term while keeping the rest of the query', 'q=ada&page=2', '', '?page=2'],
    ['clears the whole query back to the bare relative form', 'q=ada', '', '?'],
  ])('%s', (_name, query, draft, expectedHref) => {
    searchParamsMock.mockReturnValue(new URLSearchParams(query));
    render(<AgentMembersSearch />);
    type(draft);
    advance(SEARCH_COMMIT_DELAY_MS);
    expect(replaceMock.mock.calls).toEqual([[expectedHref]]);
  });

  it('never navigates for a draft that normalizes to the committed term', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('q=ada&tenantId=tenant_ks'));

    render(<AgentMembersSearch />);

    type('ada');
    advance(SEARCH_COMMIT_DELAY_MS);
    type('ada  ');
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(replaceMock).not.toHaveBeenCalled();
    expect(searchInput().value).toBe('ada  ');
  });

  it('keeps the input editable while its own search navigation is pending', () => {
    render(<AgentMembersSearch />);

    type('ada');
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(replaceMock).toHaveBeenCalledTimes(1);
    expect(searchInput()).not.toBeDisabled();

    type('ada lovelace');
    advance(SEARCH_COMMIT_DELAY_MS);

    expect(replaceMock.mock.calls).toEqual([['?q=ada'], ['?q=ada+lovelace']]);
  });

  it('keeps the newer draft when an earlier own commit echoes back', () => {
    const { rerender } = render(<AgentMembersSearch />);

    type('ada');
    advance(SEARCH_COMMIT_DELAY_MS);

    type('ada lovelace');
    searchParamsMock.mockReturnValue(new URLSearchParams('q=ada'));
    rerender(<AgentMembersSearch />);

    expect(searchInput().value).toBe('ada lovelace');

    advance(SEARCH_COMMIT_DELAY_MS);

    expect(replaceMock.mock.calls).toEqual([['?q=ada'], ['?q=ada+lovelace']]);
  });

  it('drops queued search work when a real sibling navigation starts', () => {
    render(<AgentMembersSearch />);

    type('abandoned');
    advance(100);

    act(() => {
      notifySiblingNavigation('/agent/members?view=archived');
    });

    advance(SEARCH_COMMIT_DELAY_MS);

    expect(replaceMock).not.toHaveBeenCalled();
    expect(searchInput()).toBeDisabled();
  });

  it('adopts an external url change over the queued draft', () => {
    const { rerender } = render(<AgentMembersSearch />);

    type('abandoned');
    searchParamsMock.mockReturnValue(new URLSearchParams('q=external&view=active'));
    rerender(<AgentMembersSearch />);

    expect(searchInput().value).toBe('external');
    expect(searchInput()).not.toBeDisabled();
    advance(SEARCH_COMMIT_DELAY_MS);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('keeps the server seed only while this url has no committed term', () => {
    render(<AgentMembersSearch initialQuery="seed" />);

    expect(searchInput().value).toBe('seed');
    advance(SEARCH_COMMIT_DELAY_MS);
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('lets the committed term win over a stale server seed on mount', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('q=current'));

    render(<AgentMembersSearch initialQuery="stale" />);

    expect(searchInput().value).toBe('current');
    advance(SEARCH_COMMIT_DELAY_MS);
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
