import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { render, pushMock, searchParamsMock } from './users-filters.test-support';
import { UsersFilters } from './users-filters';
import { AdminUsersSearchProvider } from './admin-users-search-provider';
import { AdminUsersRoleTabs } from './admin-users-role-tabs';

// Next can retain a suspended transport transition beyond the feedback timeout.
vi.mock('react', async importOriginal => {
  const original = await importOriginal<typeof import('react')>();
  return { ...original, useTransition: () => [true, (action: () => void) => action()] };
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

it('unlocks a still-pending transition and cancels a timed-out assignment to the applied selection', () => {
  searchParamsMock.mockReturnValue(
    new URLSearchParams('tenantId=tenant_ks&role=agent&assignment=assigned&search=ada')
  );
  const controls = <UsersFilters hideRole />;
  const view = render(controls);
  fireEvent.click(screen.getByTestId('admin-users-assignment-filter-unassigned'));
  expect(pushMock).toHaveBeenCalledOnce();
  expect(screen.getByTestId('admin-users-assignment-filter-assigned')).toBeDisabled();
  act(() => vi.advanceTimersByTime(10_000));
  expect(screen.getByTestId('admin-users-filter-region')).toHaveAttribute('aria-busy', 'false');
  expect(screen.getByTestId('admin-users-assignment-filter-assigned')).not.toBeDisabled();
  fireEvent.click(screen.getByTestId('admin-users-assignment-filter-assigned'));
  expect(pushMock).toHaveBeenCalledTimes(2);
  expect(pushMock).toHaveBeenLastCalledWith(
    '/admin/users?tenantId=tenant_ks&role=agent&assignment=assigned&search=ada',
    { scroll: false }
  );
  expect(screen.getByTestId('admin-users-filter-region')).toHaveAttribute('aria-busy', 'false');
  act(() => vi.advanceTimersByTime(300));
  expect(pushMock).toHaveBeenCalledTimes(2);
  fireEvent.change(screen.getByTestId('admin-users-search-input'), { target: { value: 'adam' } });
  searchParamsMock.mockReturnValue(
    new URLSearchParams('tenantId=tenant_ks&role=agent&assignment=unassigned&search=ada')
  );
  view.rerender(<AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>);
  expect(screen.getByTestId('admin-users-search-input')).toHaveValue('adam');
  act(() => vi.advanceTimersByTime(300));
  expect(pushMock).toHaveBeenCalledTimes(3);
  expect(pushMock).toHaveBeenLastCalledWith(
    '/admin/users?tenantId=tenant_ks&role=agent&assignment=assigned&search=adam',
    { scroll: false }
  );
});

it('lets the applied role tab cancel a timed-out role while retaining draft and assignment', () => {
  searchParamsMock.mockReturnValue(
    new URLSearchParams('tenantId=tenant_ks&assignment=assigned&search=ada')
  );
  render(
    <>
      <AdminUsersRoleTabs
        selectedRole="user"
        options={[
          {
            value: 'user',
            label: 'Members',
            href: '/admin/users?tenantId=tenant_ks&assignment=assigned&search=ada',
          },
          {
            value: 'agent',
            label: 'Agents',
            href: '/admin/users?tenantId=tenant_ks&assignment=assigned&search=ada&role=agent',
          },
        ]}
      />
      <UsersFilters hideRole />
    </>
  );
  fireEvent.click(screen.getByRole('link', { name: 'Agents' }));
  act(() => vi.advanceTimersByTime(10_000));
  fireEvent.change(screen.getByTestId('admin-users-search-input'), { target: { value: 'adam' } });
  fireEvent.click(screen.getByRole('link', { name: 'Members' }));
  expect(pushMock).toHaveBeenCalledTimes(2);
  expect(pushMock).toHaveBeenLastCalledWith(
    '/admin/users?tenantId=tenant_ks&assignment=assigned&search=adam',
    { scroll: false }
  );
});

it('canonicalizes encoded history before acknowledging it so controls recover immediately', () => {
  searchParamsMock.mockReturnValue(new URLSearchParams('search=ada'));
  const controls = <UsersFilters hideRole />;
  const view = render(controls);
  act(() => {
    window.history.replaceState(null, '', '/admin/users?tenantId=tenant_ks&search=john%20smith');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks&search=john+smith'));
  view.rerender(<AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>);
  expect(screen.getByTestId('admin-users-search-input')).toHaveValue('john smith');
  expect(screen.getByTestId('admin-users-filter-region')).toHaveAttribute('aria-busy', 'false');
  fireEvent.click(screen.getByTestId('admin-users-assignment-filter-assigned'));
  expect(pushMock).toHaveBeenCalledOnce();
  expect(pushMock).toHaveBeenLastCalledWith(
    '/admin/users?tenantId=tenant_ks&search=john+smith&assignment=assigned',
    { scroll: false }
  );
});

it('preserves query parameters without relying on URLSearchParams size', () => {
  vi.spyOn(URLSearchParams.prototype, 'size', 'get').mockReturnValue(0);
  searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks&search=ada'));
  render(<UsersFilters hideRole />);
  fireEvent.click(screen.getByTestId('admin-users-assignment-filter-assigned'));
  expect(pushMock).toHaveBeenLastCalledWith(
    '/admin/users?tenantId=tenant_ks&search=ada&assignment=assigned',
    { scroll: false }
  );
});

it('preserves real typing while history awaits URL publication', async () => {
  vi.useRealTimers();
  const user = userEvent.setup();
  searchParamsMock.mockReturnValue(new URLSearchParams('search=ada'));
  const controls = <UsersFilters hideRole />;
  const view = render(controls);
  act(() => {
    window.history.replaceState(null, '', '/admin/users?tenantId=tenant_ks&role=agent&search=old');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const input = screen.getByTestId('admin-users-search-input');
  await user.type(input, 'm');
  expect(input).toHaveValue('oldm');
  expect(pushMock).not.toHaveBeenCalled();
  searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks&role=agent&search=old'));
  view.rerender(<AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>);
  expect(input).toHaveValue('oldm');
  await waitFor(() => expect(pushMock).toHaveBeenCalledOnce());
  expect(pushMock).toHaveBeenLastCalledWith(
    '/admin/users?tenantId=tenant_ks&role=agent&search=oldm',
    { scroll: false }
  );
});

it('preserves newer typing across history acknowledgements that arrive after timeout', () => {
  searchParamsMock.mockReturnValue(new URLSearchParams('search=ada'));
  const controls = <UsersFilters hideRole />;
  const view = render(controls);
  act(() => {
    window.history.replaceState(null, '', '/admin/users?search=old');
    window.dispatchEvent(new PopStateEvent('popstate'));
    window.history.replaceState(null, '', '/admin/users?role=agent&search=new');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
  const input = screen.getByTestId('admin-users-search-input');
  fireEvent.change(input, { target: { value: 'newm' } });
  act(() => vi.advanceTimersByTime(10_000));
  act(() => vi.advanceTimersByTime(300));
  expect(pushMock).toHaveBeenCalledOnce();
  expect(pushMock).toHaveBeenLastCalledWith('/admin/users?role=agent&search=newm', {
    scroll: false,
  });
  for (const query of ['search=old', 'role=agent&search=new']) {
    searchParamsMock.mockReturnValue(new URLSearchParams(query));
    view.rerender(<AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>);
    expect(input).toHaveValue('newm');
    act(() => vi.advanceTimersByTime(300));
    expect(pushMock).toHaveBeenCalledOnce();
  }
  searchParamsMock.mockReturnValue(new URLSearchParams('role=agent&search=newm'));
  view.rerender(<AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>);
  expect(input).toHaveValue('newm');
  expect(screen.getByTestId('admin-users-filter-region')).toHaveAttribute('aria-busy', 'false');
});
