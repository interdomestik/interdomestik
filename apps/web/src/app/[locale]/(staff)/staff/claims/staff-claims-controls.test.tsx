import { act, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StaffClaimsControls } from './staff-claims-controls';
import {
  clickLink,
  completeNavigation,
  hiddenFieldValues,
  interact,
  isBusy,
  renderRoutedControls,
  resetNavigationHarness,
  routerPush as routerPushMock,
  typeSearch,
} from './staff-claims-controls.fixtures';

vi.mock('@/i18n/routing', () => import('./staff-claims-controls.fixtures'));

function renderControls(href?: string) {
  return renderRoutedControls(props => <StaffClaimsControls {...props} />, href);
}

describe('StaffClaimsControls', () => {
  beforeEach(() => {
    resetNavigationHarness();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('submits trimmed search while preserving active staff claim filters', async () => {
    renderControls();

    fireEvent.change(screen.getByTestId('staff-claims-search-input'), {
      target: { value: '  Claim 42  ' },
    });
    await interact(() => fireEvent.submit(screen.getByTestId('staff-claims-search-form')));

    expect(routerPushMock).toHaveBeenCalledWith(
      '/staff/claims?assigned=unassigned&status=verification&diaspora=diaspora&search=Claim+42'
    );
    expect(screen.getByTestId('staff-claims-pending')).toHaveTextContent('Searching claims...');
    expect(screen.getByTestId('staff-claims-search-submit')).toBeDisabled();
  });

  it('omits blank search without dropping other active filters', async () => {
    // Starts from a searched route: blank over an already blank query is a no-op.
    renderControls();

    fireEvent.change(screen.getByTestId('staff-claims-search-input'), {
      target: { value: '   ' },
    });
    await interact(() => fireEvent.submit(screen.getByTestId('staff-claims-search-form')));

    expect(routerPushMock).toHaveBeenCalledWith(
      '/staff/claims?assigned=unassigned&status=verification&diaspora=diaspora'
    );
  });

  it('navigates filter clicks through the client pending contract', async () => {
    renderControls();

    await interact(() => fireEvent.click(screen.getByTestId('staff-claims-status-filter-all')));

    expect(routerPushMock).toHaveBeenCalledWith(
      '/staff/claims?assigned=unassigned&diaspora=diaspora&search=Acme'
    );
    expect(screen.getByTestId('staff-claims-pending')).toHaveTextContent('Updating filters...');
    expect(screen.getByTestId('staff-claims-assigned-filter-all')).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });

  it('keeps active filter links inert to avoid redundant pending states', async () => {
    renderControls();

    await interact(() =>
      fireEvent.click(screen.getByTestId('staff-claims-status-filter-verification'))
    );

    expect(routerPushMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('staff-claims-pending')).not.toBeInTheDocument();
  });

  it('blocks overlapping primary navigations while a filter transition is pending', async () => {
    renderControls();

    await interact(() => fireEvent.click(screen.getByTestId('staff-claims-status-filter-all')));
    await interact(() => fireEvent.click(screen.getByTestId('staff-claims-assigned-filter-all')));

    expect(routerPushMock).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledWith(
      '/staff/claims?assigned=unassigned&diaspora=diaspora&search=Acme'
    );
  });

  it('keeps typing local until the explicit submit', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderControls();

    for (const value of ['C', 'Cl', 'Claim', 'Claim 42']) {
      typeSearch(value);
    }
    await act(async () => {
      vi.advanceTimersByTime(1_000);
    });

    expect(routerPushMock).not.toHaveBeenCalled();
    expect(isBusy()).toBe(false);
    expect(screen.getByTestId('staff-claims-search-input')).toHaveValue('Claim 42');
  });

  it('preserves the other filter groups across clear and filter navigations', async () => {
    renderControls();

    await clickLink(screen.getByRole('link', { name: 'Clear' }));
    const cleared = '/staff/claims?assigned=unassigned&status=verification&diaspora=diaspora';
    expect(routerPushMock).toHaveBeenLastCalledWith(cleared);
    expect(screen.getByTestId('staff-claims-pending')).toHaveTextContent('Updating filters...');
    await completeNavigation(cleared);

    expect(screen.queryByRole('link', { name: 'Clear' })).not.toBeInTheDocument();
    expect(hiddenFieldValues()).toEqual({
      assigned: 'unassigned',
      diaspora: 'diaspora',
      status: 'verification',
    });

    const steps = [
      ['staff-claims-assigned-filter-all', '/staff/claims?status=verification&diaspora=diaspora'],
      ['staff-claims-diaspora-filter-all', '/staff/claims?status=verification'],
      ['staff-claims-status-filter-all', '/staff/claims'],
    ] as const;
    for (const [testId, href] of steps) {
      expect(await clickLink(screen.getByTestId(testId))).toBe(false);
      expect(routerPushMock).toHaveBeenLastCalledWith(href);
      await completeNavigation(href);
    }

    expect(routerPushMock).toHaveBeenCalledTimes(4);
    expect(hiddenFieldValues()).toEqual({});
    expect(isBusy()).toBe(false);
  });

  it('leaves modified and non-primary anchor activations to the browser', async () => {
    renderControls();
    const statusAll = screen.getByTestId('staff-claims-status-filter-all');
    const clearSearch = screen.getByRole('link', { name: 'Clear' });
    const nativeActivations: MouseEventInit[] = [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ];

    for (const init of nativeActivations) {
      expect(await clickLink(statusAll, init)).toBe(true);
      expect(await clickLink(clearSearch, init)).toBe(true);
    }

    expect(routerPushMock).not.toHaveBeenCalled();
    expect(isBusy()).toBe(false);
    expect(screen.queryByTestId('staff-claims-pending')).not.toBeInTheDocument();

    expect(await clickLink(statusAll)).toBe(false);
    expect(
      await clickLink(screen.getByTestId('staff-claims-assigned-filter-all'), { metaKey: true })
    ).toBe(true);
    expect(routerPushMock).toHaveBeenCalledTimes(1);
  });
});
