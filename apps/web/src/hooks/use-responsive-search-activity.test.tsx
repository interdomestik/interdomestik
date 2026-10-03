import { act, fireEvent, render, screen } from '@testing-library/react';
import { Activity } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useResponsiveSearch } from './use-responsive-search';

const navigate = vi.fn();
function RetainedSearch({ query = 'q=alpha' }: { query?: string }) {
  const search = useResponsiveSearch({
    searchParams: new URLSearchParams(query),
    pathname: '/agent/members',
    searchKey: 'q',
    navigate,
  });
  return (
    <div data-testid="retained-region" data-pending={search.pendingKind ?? 'none'}>
      <input
        data-testid="retained-draft"
        value={search.draft}
        disabled={search.pendingKind === 'filter'}
        onChange={event => search.editDraft(event.target.value)}
      />
      <button onClick={() => search.cancelScheduledSearch()}>Leave route</button>
    </div>
  );
}
function Tree({ hidden = false, query }: { hidden?: boolean; query?: string }) {
  return (
    <Activity mode={hidden ? 'hidden' : 'visible'}>
      <RetainedSearch query={query} />
    </Activity>
  );
}
beforeEach(() => {
  vi.useFakeTimers();
  navigate.mockReset();
  window.history.replaceState(null, '', '/agent/members?q=alpha');
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

it('Back reveals a retained route with its committed query and no abandoned pending owner', () => {
  const { rerender } = render(<Tree />);
  fireEvent.change(screen.getByTestId('retained-draft'), { target: { value: 'alpha beta' } });
  fireEvent.click(screen.getByRole('button', { name: 'Leave route' }));
  expect(screen.getByTestId('retained-region')).toHaveAttribute('data-pending', 'filter');
  rerender(<Tree hidden />);
  window.history.replaceState(null, '', '/agent/clients');
  window.history.replaceState(null, '', '/agent/members?q=alpha');
  act(() => window.dispatchEvent(new PopStateEvent('popstate')));
  rerender(<Tree />);
  expect(screen.getByTestId('retained-draft')).toHaveValue('alpha');
  expect(screen.getByTestId('retained-region')).toHaveAttribute('data-pending', 'none');
  expect(screen.getByTestId('retained-draft')).not.toBeDisabled();
  act(() => vi.advanceTimersByTime(10_500));
  expect(navigate).not.toHaveBeenCalled();
});

it('Back to an empty committed search discards the retained abandoned draft', () => {
  window.history.replaceState(null, '', '/agent/members');
  const { rerender } = render(<Tree query="" />);
  fireEvent.change(screen.getByTestId('retained-draft'), { target: { value: 'abandoned' } });
  fireEvent.click(screen.getByRole('button', { name: 'Leave route' }));
  expect(screen.getByTestId('retained-region')).toHaveAttribute('data-pending', 'filter');
  rerender(<Tree hidden query="" />);
  window.history.replaceState(null, '', '/agent/clients');
  window.history.replaceState(null, '', '/agent/members');
  act(() => window.dispatchEvent(new PopStateEvent('popstate')));
  rerender(<Tree query="" />);
  expect(screen.getByTestId('retained-draft')).toHaveValue('');
  expect(screen.getByTestId('retained-region')).toHaveAttribute('data-pending', 'none');
  expect(screen.getByTestId('retained-draft')).not.toBeDisabled();
  act(() => vi.advanceTimersByTime(10_500));
  expect(navigate).not.toHaveBeenCalled();
});
