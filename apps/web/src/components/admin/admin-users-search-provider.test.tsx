import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, pushMock, searchParamsMock, pathnameMock } from './users-filters.test-support';
import { UsersFilters } from './users-filters';
import { AdminUsersSearchProvider } from './admin-users-search-provider';
import { AdminUsersRoleTabs } from './admin-users-role-tabs';

describe('Admin users search navigation', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    vi.clearAllMocks();
    pathnameMock.mockReturnValue('/admin/users');
    searchParamsMock.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState(null, '', '/');
  });

  it('coalesces character typing and keeps the input editable while navigation is pending', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<UsersFilters hideRole hideAssignment />);
    const input = screen.getByTestId('admin-users-search-input');
    await user.type(input, 'ada');
    expect(input).toHaveValue('ada');
    expect(pushMock).not.toHaveBeenCalled();
    await waitFor(() => expect(pushMock).toHaveBeenCalledOnce());
    expect(pushMock).toHaveBeenCalledOnce();
    expect(pushMock).toHaveBeenLastCalledWith('/admin/users?search=ada', { scroll: false });
    await user.type(input, 'm');
    expect(input).toHaveValue('adam');
    expect(input).not.toBeDisabled();
  });

  it('recovers after timeout and retains the newer draft across out-of-order commits', async () => {
    const user = {
      type: async (element: HTMLElement, text: string) => {
        for (const char of text)
          fireEvent.change(element, {
            target: { value: (element as HTMLInputElement).value + char },
          });
      },
      click: async (element: HTMLElement) => {
        fireEvent.click(element);
      },
    };
    const view = render(<UsersFilters hideRole hideAssignment />);
    const input = screen.getByTestId('admin-users-search-input');
    await user.type(input, 'a');
    act(() => vi.advanceTimersByTime(300));
    await user.type(input, 'da');
    act(() => vi.advanceTimersByTime(11_000));
    act(() => vi.advanceTimersByTime(300));
    expect(pushMock).toHaveBeenCalledTimes(2);
    expect(input).toHaveValue('ada');
    searchParamsMock.mockReturnValue(new URLSearchParams('search=a'));
    view.rerender(
      <AdminUsersSearchProvider>
        <UsersFilters hideRole hideAssignment />
      </AdminUsersSearchProvider>
    );
    expect(input).toHaveValue('ada');
    act(() => vi.advanceTimersByTime(300));
    expect(pushMock).toHaveBeenCalledTimes(2);
    searchParamsMock.mockReturnValue(new URLSearchParams('search=ada'));
    view.rerender(
      <AdminUsersSearchProvider>
        <UsersFilters hideRole hideAssignment />
      </AdminUsersSearchProvider>
    );
    expect(input).toHaveValue('ada');
    expect(screen.getByTestId('admin-users-filter-region')).toHaveAttribute('aria-busy', 'false');
  });

  it('carries the draft into a role tab and preserves role when later typing commits', async () => {
    const user = {
      type: async (element: HTMLElement, text: string) => {
        for (const char of text)
          fireEvent.change(element, {
            target: { value: (element as HTMLInputElement).value + char },
          });
      },
      click: async (element: HTMLElement) => {
        fireEvent.click(element);
      },
    };
    const controls = (
      <>
        <AdminUsersRoleTabs
          selectedRole="user"
          options={[
            { value: 'user', label: 'Members', href: '/admin/users?tenantId=tenant_ks' },
            { value: 'agent', label: 'Agents', href: '/admin/users?tenantId=tenant_ks&role=agent' },
          ]}
        />
        <UsersFilters hideRole hideAssignment />
      </>
    );
    searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks&page=2'));
    const view = render(controls);
    const input = screen.getByTestId('admin-users-search-input');
    await user.type(input, 'ada');
    await user.click(screen.getByRole('link', { name: 'Agents' }));
    expect(pushMock).toHaveBeenLastCalledWith(
      '/admin/users?tenantId=tenant_ks&role=agent&search=ada',
      { scroll: false }
    );
    await user.type(input, 'm');
    act(() => vi.advanceTimersByTime(300));
    expect(pushMock).toHaveBeenCalledOnce();
    searchParamsMock.mockReturnValue(
      new URLSearchParams('tenantId=tenant_ks&role=agent&search=ada')
    );
    view.rerender(<AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>);
    expect(input).toHaveValue('adam');
    act(() => vi.advanceTimersByTime(300));
    expect(pushMock).toHaveBeenLastCalledWith(
      '/admin/users?tenantId=tenant_ks&role=agent&search=adam',
      { scroll: false }
    );
  });

  it('restores back/forward without a stale timer even when URL publication is delayed', async () => {
    const user = {
      type: async (element: HTMLElement, text: string) => {
        for (const char of text)
          fireEvent.change(element, {
            target: { value: (element as HTMLInputElement).value + char },
          });
      },
      click: async (element: HTMLElement) => {
        fireEvent.click(element);
      },
    };
    searchParamsMock.mockReturnValue(new URLSearchParams('search=ada'));
    const controls = <UsersFilters hideRole hideAssignment />;
    const view = render(controls);
    const input = screen.getByTestId('admin-users-search-input');
    await user.type(input, 'm');
    act(() => {
      window.history.replaceState(null, '', '/admin/users?search=old');
      window.dispatchEvent(new PopStateEvent('popstate'));
      vi.advanceTimersByTime(500);
    });
    expect(input).toHaveValue('old');
    expect(pushMock).not.toHaveBeenCalled();
    searchParamsMock.mockReturnValue(new URLSearchParams('search=old'));
    view.rerender(<AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>);
    act(() => vi.advanceTimersByTime(500));
    expect(pushMock).not.toHaveBeenCalled();
    act(() => {
      window.history.replaceState(null, '', '/admin/users?search=ada');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    searchParamsMock.mockReturnValue(new URLSearchParams('search=ada'));
    view.rerender(<AdminUsersSearchProvider>{controls}</AdminUsersSearchProvider>);
    expect(input).toHaveValue('ada');
    act(() => vi.advanceTimersByTime(500));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it('clears search and cancels pending debounce on unmount', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('role=agent&search=ada'));
    const view = render(<UsersFilters hideRole hideAssignment />);
    fireEvent.change(screen.getByTestId('admin-users-search-input'), { target: { value: '' } });
    act(() => vi.advanceTimersByTime(300));
    expect(pushMock).toHaveBeenCalledWith('/admin/users?role=agent', { scroll: false });
    view.unmount();
    act(() => vi.advanceTimersByTime(11_000));
    expect(pushMock).toHaveBeenCalledOnce();
  });
  it('recovers failed navigation controls and ignores same-query popstate without locking', () => {
    render(<UsersFilters />);
    fireEvent.click(screen.getByTestId('admin-users-assignment-filter-assigned'));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.getByTestId('admin-users-assignment-filter-unassigned')).not.toBeDisabled();
    act(() => {
      window.history.replaceState(null, '', '/admin/users#history');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByTestId('admin-users-filter-region')).toHaveAttribute('aria-busy', 'false');
    fireEvent.click(screen.getByTestId('admin-users-assignment-filter-unassigned'));
    expect(pushMock).toHaveBeenLastCalledWith('/admin/users?assignment=unassigned', {
      scroll: false,
    });
  });
  it('retains the intended role when search retries after a slow tab navigation timeout', () => {
    const controls = (
      <>
        <AdminUsersRoleTabs
          selectedRole="user"
          options={[
            { value: 'user', label: 'Members', href: '/admin/users' },
            { value: 'agent', label: 'Agents', href: '/admin/users?role=agent' },
          ]}
        />
        <UsersFilters hideRole hideAssignment />
      </>
    );
    render(controls);
    fireEvent.change(screen.getByTestId('admin-users-search-input'), { target: { value: 'ada' } });
    fireEvent.click(screen.getByRole('link', { name: 'Agents' }));
    fireEvent.change(screen.getByTestId('admin-users-search-input'), { target: { value: 'adam' } });
    act(() => vi.advanceTimersByTime(10_000));
    act(() => vi.advanceTimersByTime(300));
    expect(pushMock).toHaveBeenLastCalledWith('/admin/users?role=agent&search=adam', {
      scroll: false,
    });
  });
  it('retries the same timed-out draft on Enter with filters and ignores composition/pending submit', () => {
    searchParamsMock.mockReturnValue(
      new URLSearchParams('tenantId=tenant_ks&role=agent&assignment=unassigned&page=2')
    );
    render(<UsersFilters hideRole hideAssignment />);
    const input = screen.getByTestId('admin-users-search-input');
    for (const char of 'ada')
      fireEvent.change(input, { target: { value: (input as HTMLInputElement).value + char } });
    act(() => vi.advanceTimersByTime(300));
    expect(pushMock).toHaveBeenCalledOnce();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledOnce();
    act(() => vi.advanceTimersByTime(20_000));
    expect(pushMock).toHaveBeenCalledOnce();
    expect(input).toHaveValue('ada');
    fireEvent.keyDown(input, { key: 'Enter', isComposing: true });
    expect(pushMock).toHaveBeenCalledOnce();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(pushMock).toHaveBeenCalledTimes(2);
    expect(pushMock).toHaveBeenLastCalledWith(
      '/admin/users?tenantId=tenant_ks&role=agent&assignment=unassigned&search=ada',
      { scroll: false }
    );
    fireEvent.keyDown(input, { key: 'Enter' });
    act(() => vi.advanceTimersByTime(20_000));
    expect(pushMock).toHaveBeenCalledTimes(2);
  });
  it('preserves timed-out role and assignment targets when another filter changes', () => {
    searchParamsMock.mockReturnValue(new URLSearchParams('tenantId=tenant_ks'));
    render(
      <>
        <AdminUsersRoleTabs
          selectedRole="user"
          options={[
            { value: 'user', label: 'Members', href: '/admin/users?tenantId=tenant_ks' },
            { value: 'agent', label: 'Agents', href: '/admin/users?tenantId=tenant_ks&role=agent' },
          ]}
        />
        <UsersFilters hideRole />
      </>
    );
    fireEvent.change(screen.getByTestId('admin-users-search-input'), { target: { value: 'ada' } });
    fireEvent.click(screen.getByRole('link', { name: 'Agents' }));
    act(() => vi.advanceTimersByTime(10_000));
    fireEvent.click(screen.getByTestId('admin-users-assignment-filter-assigned'));
    expect(pushMock).toHaveBeenLastCalledWith(
      '/admin/users?tenantId=tenant_ks&role=agent&search=ada&assignment=assigned',
      { scroll: false }
    );
    act(() => vi.advanceTimersByTime(10_000));
    fireEvent.click(screen.getByTestId('admin-users-assignment-filter-unassigned'));
    act(() => vi.advanceTimersByTime(10_000));
    expect(pushMock).toHaveBeenCalledTimes(3);
    fireEvent.click(screen.getByRole('link', { name: 'Agents' }));
    expect(pushMock).toHaveBeenCalledTimes(4);
    expect(pushMock).toHaveBeenLastCalledWith(
      '/admin/users?tenantId=tenant_ks&role=agent&search=ada&assignment=unassigned',
      { scroll: false }
    );
  });
});
