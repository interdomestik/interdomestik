import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StaffClaimsControls } from './staff-claims-controls';
import {
  clickLink,
  completeNavigation,
  hiddenFieldValues,
  INITIAL_HREF,
  interact,
  isBusy,
  renderRoutedControls,
  resetNavigationHarness,
  routerPush,
  submitSearch,
  traverseHistory,
  typeSearch,
} from './staff-claims-controls.fixtures';

vi.mock('@/i18n/routing', () => import('./staff-claims-controls.fixtures'));

const SEARCH_HREF =
  '/staff/claims?assigned=unassigned&status=verification&diaspora=diaspora&search=Claim+42';
const STATUS_ALL_HREF = '/staff/claims?assigned=unassigned&diaspora=diaspora&search=Acme';

function renderControls(href?: string) {
  return renderRoutedControls(props => <StaffClaimsControls {...props} />, href);
}

function routedResult() {
  return screen.getByTestId('routed-result').textContent;
}

function pendingText() {
  return screen.queryByTestId('staff-claims-pending')?.textContent ?? null;
}

function expectReleased() {
  expect(isBusy()).toBe(false);
  expect(pendingText()).toBeNull();
  expect(screen.getByTestId('staff-claims-search-submit')).toBeEnabled();
}

async function advance(ms: number) {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
}

describe('StaffClaimsControls navigation lifecycle', () => {
  beforeEach(() => {
    // Fake timers so no hidden timer can stand in for a settled navigation.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    resetNavigationHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('releases the retained controls when the current navigation commits', async () => {
    renderControls();
    const section = screen.getByTestId('staff-claims-filters');

    typeSearch('  Claim 42  ');
    expect(await submitSearch()).toBe(false);

    expect(routerPush).toHaveBeenCalledWith(SEARCH_HREF);
    expect(isBusy()).toBe(true);
    expect(pendingText()).toBe('Searching claims...');
    expect(screen.getByTestId('staff-claims-search-submit')).toBeDisabled();
    expect(routedResult()).toBe(INITIAL_HREF);

    // No time advanced: only the committed destination releases the controls.
    await completeNavigation(SEARCH_HREF);

    expect(routedResult()).toBe(SEARCH_HREF);
    expect(screen.getByTestId('staff-claims-filters')).toBe(section);
    expect(screen.getByTestId('staff-claims-search-input')).toHaveValue('  Claim 42  ');
    expect(screen.getByTestId('staff-claims-assigned-filter-all')).not.toHaveAttribute(
      'aria-disabled'
    );
    expectReleased();

    const nextHref = '/staff/claims?assigned=unassigned&diaspora=diaspora&search=Claim+42';
    expect(await clickLink(screen.getByTestId('staff-claims-status-filter-all'))).toBe(false);
    expect(routerPush).toHaveBeenLastCalledWith(nextHref);
    expect(pendingText()).toBe('Updating filters...');

    await completeNavigation(nextHref);
    expect(routedResult()).toBe(nextHref);
    expectReleased();
    expect(routerPush).toHaveBeenCalledTimes(2);
  });

  it('treats an unchanged normalized search as a no-op without busy feedback', async () => {
    const { unmount } = renderControls();

    typeSearch('  Acme  ');
    expect(await submitSearch()).toBe(false);

    expect(routerPush).not.toHaveBeenCalled();
    expectReleased();
    expect(screen.getByTestId('staff-claims-search-input')).toHaveValue('  Acme  ');
    unmount();

    renderControls('/staff/claims?status=verification');
    typeSearch('   ');
    expect(await submitSearch()).toBe(false);

    expect(routerPush).not.toHaveBeenCalled();
    expectReleased();
  });

  it('keeps a genuinely outstanding navigation pending past ten seconds', async () => {
    renderControls();

    typeSearch('Claim 42');
    await submitSearch();
    await advance(10_001);

    expect(isBusy()).toBe(true);
    expect(pendingText()).toBe('Searching claims...');
    expect(screen.getByTestId('staff-claims-search-submit')).toBeDisabled();

    await submitSearch();
    expect(await clickLink(screen.getByTestId('staff-claims-status-filter-all'))).toBe(false);
    expect(routerPush).toHaveBeenCalledTimes(1);

    await completeNavigation(SEARCH_HREF);
    expect(routedResult()).toBe(SEARCH_HREF);
    expectReleased();
  });

  it('restores controls when history traversal supersedes an outstanding navigation', async () => {
    renderControls();

    typeSearch('Claim 42');
    await submitSearch();
    expect(isBusy()).toBe(true);

    await traverseHistory(INITIAL_HREF);

    expect(routedResult()).toBe(INITIAL_HREF);
    expectReleased();
    expect(screen.getByTestId('staff-claims-search-input')).toHaveValue('Claim 42');
    expect(hiddenFieldValues()).toEqual({
      assigned: 'unassigned',
      diaspora: 'diaspora',
      status: 'verification',
    });
    expect(screen.getByRole('link', { name: 'Clear' })).toBeInTheDocument();

    await traverseHistory('/staff/claims?status=verification');

    expect(routedResult()).toBe('/staff/claims?status=verification');
    expectReleased();
    expect(hiddenFieldValues()).toEqual({ status: 'verification' });
    expect(screen.queryByRole('link', { name: 'Clear' })).not.toBeInTheDocument();

    await submitSearch();
    expect(routerPush).toHaveBeenLastCalledWith(
      '/staff/claims?status=verification&search=Claim+42'
    );
    expect(isBusy()).toBe(true);
  });

  it('starts one navigation for duplicate primary activations in one event turn', async () => {
    renderControls();
    const form = screen.getByTestId('staff-claims-search-form');
    const statusAll = screen.getByTestId('staff-claims-status-filter-all');
    const clearSearch = screen.getByRole('link', { name: 'Clear' });

    typeSearch('Claim 42');
    await interact(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      fireEvent.click(statusAll);
      fireEvent.click(clearSearch);
    });

    expect(routerPush).toHaveBeenCalledTimes(1);
    expect(routerPush).toHaveBeenCalledWith(SEARCH_HREF);
    expect(pendingText()).toBe('Searching claims...');
  });

  it('keeps a newer owner pending when an older navigation settles late', async () => {
    renderControls();

    typeSearch('Claim 42');
    await submitSearch();
    await traverseHistory(INITIAL_HREF);
    expectReleased();

    await clickLink(screen.getByTestId('staff-claims-status-filter-all'));
    expect(routerPush).toHaveBeenLastCalledWith(STATUS_ALL_HREF);

    await completeNavigation(SEARCH_HREF);

    expect(routedResult()).toBe(INITIAL_HREF);
    expect(isBusy()).toBe(true);
    expect(pendingText()).toBe('Updating filters...');

    await completeNavigation(STATUS_ALL_HREF);
    expect(routedResult()).toBe(STATUS_ALL_HREF);
    expectReleased();
  });

  it('lets a newer route finish while the superseded destination remains unresolved', async () => {
    renderControls();

    typeSearch('Claim 42');
    await submitSearch();
    await traverseHistory(INITIAL_HREF);
    expectReleased();

    await clickLink(screen.getByTestId('staff-claims-status-filter-all'));
    expect(isBusy()).toBe(true);
    await completeNavigation(STATUS_ALL_HREF);

    expect(routedResult()).toBe(STATUS_ALL_HREF);
    expectReleased();
    expect(hiddenFieldValues()).toEqual({ assigned: 'unassigned', diaspora: 'diaspora' });

    // The older destination can settle after the current result is already usable.
    await completeNavigation(SEARCH_HREF);
    expect(routedResult()).toBe(STATUS_ALL_HREF);
    expectReleased();
    expect(hiddenFieldValues()).toEqual({ assigned: 'unassigned', diaspora: 'diaspora' });
    expect(routerPush).toHaveBeenCalledTimes(2);
  });

  it('does not let an earlier owner timeline release a newer same-kind owner', async () => {
    renderControls();

    await clickLink(screen.getByTestId('staff-claims-status-filter-all'));
    await advance(6_000);
    await completeNavigation(STATUS_ALL_HREF);
    expectReleased();

    const assignedAllHref = '/staff/claims?diaspora=diaspora&search=Acme';
    await clickLink(screen.getByTestId('staff-claims-assigned-filter-all'));
    expect(routerPush).toHaveBeenLastCalledWith(assignedAllHref);
    await advance(5_000);

    expect(isBusy()).toBe(true);
    expect(pendingText()).toBe('Updating filters...');

    await completeNavigation(assignedAllHref);
    expect(routedResult()).toBe(assignedAllHref);
    expectReleased();
  });
});
