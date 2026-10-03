import { act, fireEvent, render as renderView, screen } from '@testing-library/react';
import { Activity } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pathnameMock, pushMock, render, searchParamsMock } from './users-filters.test-support';
import { AdminUsersSearchProvider } from './admin-users-search-provider';
import { UsersFilters } from './users-filters';

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));
const controls = <UsersFilters hideRole hideAssignment />;
const edit = (value: string) =>
  fireEvent.change(screen.getByTestId('admin-users-search-input'), { target: { value } });

describe('Admin users shared responsive search default', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.clearAllMocks();
    pathnameMock.mockReturnValue('/admin/users');
    searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks&role=agent&page=3'));
    window.history.replaceState(null, '', '/admin/users?tenantId=tenant_ks&role=agent&page=3');
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  it('commits one burst at the shared 250ms boundary while preserving role and resetting page', () => {
    render(controls);
    edit('a');
    advance(100);
    edit('ada');
    expect(screen.getByTestId('admin-users-search-input')).toHaveValue('ada');
    advance(249);
    expect(pushMock).not.toHaveBeenCalled();
    advance(1);
    expect(pushMock).toHaveBeenCalledExactlyOnceWith(
      '/admin/users?tenantId=tenant_ks&role=agent&search=ada',
      { scroll: false }
    );
  });

  it('issues a newer draft while its earlier search is still awaiting publication', () => {
    const view = render(controls);
    edit('a');
    advance(300);
    expect(pushMock).toHaveBeenCalledOnce();
    edit('ada');
    expect(screen.getByTestId('admin-users-search-input')).not.toBeDisabled();
    advance(250);
    expect(pushMock).toHaveBeenCalledTimes(2);
    expect(pushMock).toHaveBeenLastCalledWith(
      '/admin/users?tenantId=tenant_ks&role=agent&search=ada',
      { scroll: false }
    );
    searchParamsMock.mockReturnValue(
      new URLSearchParams('tenantId=tenant_ks&role=agent&search=ada')
    );
    view.rerender(<AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>);
    expect(screen.getByTestId('admin-users-filter-region')).toHaveAttribute('aria-busy', 'false');
    searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks&role=agent&search=a'));
    view.rerender(<AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>);
    expect(screen.getByTestId('admin-users-search-input')).toHaveValue('ada');
    expect(pushMock).toHaveBeenLastCalledWith(
      '/admin/users?tenantId=tenant_ks&role=agent&search=ada',
      { scroll: false }
    );
  });

  it('does not let an already queued recovery callback release a newer search owner', () => {
    const timers = vi.spyOn(window, 'setTimeout');
    render(controls);
    edit('a');
    advance(250);
    const stale = timers.mock.calls.find(([, delay]) => delay === 10_000)?.[0];
    if (typeof stale !== 'function') throw new Error('No real recovery callback captured');
    edit('ada');
    advance(250);
    expect(pushMock).toHaveBeenCalledTimes(2);
    act(() => stale());
    expect(screen.getByTestId('admin-users-filter-region')).toHaveAttribute('aria-busy', 'true');
  });

  it('drops an obsolete hidden draft when Activity resumes before external URL publication', () => {
    const tree = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>
      </Activity>
    );
    const view = renderView(tree('visible'));
    edit('obsolete');
    advance(100);
    view.rerender(tree('hidden'));
    advance(1000);
    expect(pushMock).not.toHaveBeenCalled();
    window.history.replaceState(
      null,
      '',
      '/admin/users?tenantId=tenant_ks&role=user&search=external'
    );
    view.rerender(tree('visible'));
    expect(screen.getByTestId('admin-users-search-input')).toHaveValue('external');
    advance(300);
    expect(pushMock).not.toHaveBeenCalled();
    searchParamsMock.mockReturnValue(
      new URLSearchParams('tenantId=tenant_ks&role=user&search=external')
    );
    view.rerender(tree('visible'));
    expect(screen.getByTestId('admin-users-search-input')).toHaveValue('external');
  });

  it('adopts the committed query after a cancelled draft leaves and resumes the same URL', () => {
    const siblingHref = '/admin/overview?tenantId=tenant_ks';
    const tree = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>
        <a href={siblingHref} onClick={event => event.preventDefault()}>
          Dashboard
        </a>
      </Activity>
    );
    const view = renderView(tree('visible'));
    edit('obsolete');
    advance(100);
    fireEvent.click(screen.getByRole('link', { name: 'Dashboard' }));
    view.rerender(tree('hidden'));
    advance(1000);
    view.rerender(tree('visible'));
    expect(screen.getByTestId('admin-users-search-input')).toHaveValue('');
    advance(300);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('retains legitimate draft on an unchanged Activity resume without sibling navigation', () => {
    const tree = (mode: 'visible' | 'hidden') => (
      <Activity mode={mode}>
        <AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>
      </Activity>
    );
    const view = renderView(tree('visible'));
    edit('legitimate');
    advance(100);
    view.rerender(tree('hidden'));
    advance(1000);
    view.rerender(tree('visible'));
    expect(screen.getByTestId('admin-users-search-input')).toHaveValue('legitimate');
    advance(250);
    expect(pushMock).toHaveBeenCalledExactlyOnceWith(
      '/admin/users?tenantId=tenant_ks&role=agent&search=legitimate',
      { scroll: false }
    );
  });

  it('cancels a queued draft before an external sidebar role navigation starts', () => {
    const siblingHref = '/admin/users?tenantId=tenant_ks&role=user';
    render(
      <>
        {controls}
        <a
          href={siblingHref}
          onClick={event => {
            event.preventDefault();
            pushMock(siblingHref);
          }}
        >
          Sidebar Members
        </a>
      </>
    );
    edit('obsolete');
    advance(100);
    fireEvent.click(screen.getByRole('link', { name: 'Sidebar Members' }));
    advance(300);
    expect(pushMock).toHaveBeenCalledExactlyOnceWith('/admin/users?tenantId=tenant_ks&role=user');
  });
});
