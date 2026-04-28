/* eslint-disable @next/next/no-html-link-for-pages */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NavigationFeedback } from './navigation-feedback';

const routeState = vi.hoisted(() => ({
  pathname: '/sq/member',
  search: '',
}));

vi.mock('@/i18n/routing', () => ({
  usePathname: () => routeState.pathname,
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(routeState.search),
}));

describe('NavigationFeedback', () => {
  beforeEach(() => {
    routeState.pathname = '/sq/member';
    routeState.search = '';
    window.history.pushState({}, '', '/sq/member');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not show a pending indicator before navigation starts', () => {
    render(
      <NavigationFeedback>
        <a href="/sq/member/claims">Claims</a>
      </NavigationFeedback>
    );

    expect(screen.queryByTestId('portal-navigation-progress')).not.toBeInTheDocument();
  });

  it('shows a pending indicator for normal internal link navigation', () => {
    render(
      <NavigationFeedback>
        <a href="/sq/member/claims">Claims</a>
      </NavigationFeedback>
    );

    fireEvent.click(screen.getByRole('link', { name: 'Claims' }));

    expect(screen.getByTestId('portal-navigation-progress')).toBeInTheDocument();
  });

  it('ignores links that do not trigger app navigation', () => {
    render(
      <NavigationFeedback>
        <a href="https://external.test">External</a>
        <a download href="/sq/member/report.pdf">
          Download
        </a>
        <a href="/sq/member#quota">Same page</a>
      </NavigationFeedback>
    );

    fireEvent.click(screen.getByRole('link', { name: 'External' }));
    fireEvent.click(screen.getByRole('link', { name: 'Download' }));
    fireEvent.click(screen.getByRole('link', { name: 'Same page' }));

    expect(screen.queryByTestId('portal-navigation-progress')).not.toBeInTheDocument();
  });

  it('ignores internal navigation cancelled by the link handler', () => {
    render(
      <NavigationFeedback>
        <a
          data-navigation-feedback="ignore"
          href="/sq/member/claims"
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          Cancelled
        </a>
      </NavigationFeedback>
    );

    fireEvent.click(screen.getByRole('link', { name: 'Cancelled' }));

    expect(screen.queryByTestId('portal-navigation-progress')).not.toBeInTheDocument();
  });

  it('clears the pending indicator when internal navigation is cancelled after capture', () => {
    vi.useFakeTimers();
    render(
      <NavigationFeedback>
        <a
          href="/sq/member/claims"
          onClick={event => {
            event.preventDefault();
          }}
        >
          Cancelled
        </a>
      </NavigationFeedback>
    );

    fireEvent.click(screen.getByRole('link', { name: 'Cancelled' }));
    expect(screen.getByTestId('portal-navigation-progress')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(2_499);
    });

    expect(screen.queryByTestId('portal-navigation-progress')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(screen.queryByTestId('portal-navigation-progress')).not.toBeInTheDocument();
  });

  it('clears the pending indicator when the route changes', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <NavigationFeedback>
        <a href="/sq/member/claims">Claims</a>
      </NavigationFeedback>
    );

    fireEvent.click(screen.getByRole('link', { name: 'Claims' }));
    expect(screen.getByTestId('portal-navigation-progress')).toBeInTheDocument();

    routeState.pathname = '/sq/member/claims';
    window.history.pushState({}, '', '/sq/member/claims');
    rerender(
      <NavigationFeedback>
        <a href="/sq/member">Overview</a>
      </NavigationFeedback>
    );

    expect(screen.getByTestId('portal-navigation-progress')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(screen.queryByTestId('portal-navigation-progress')).not.toBeInTheDocument();
  });

  it('clears the pending indicator after the fallback timeout', () => {
    vi.useFakeTimers();
    render(
      <NavigationFeedback>
        <a href="/sq/member/claims">Claims</a>
      </NavigationFeedback>
    );

    fireEvent.click(screen.getByRole('link', { name: 'Claims' }));
    expect(screen.getByTestId('portal-navigation-progress')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(10_000);
    });

    expect(screen.queryByTestId('portal-navigation-progress')).not.toBeInTheDocument();
  });
});
