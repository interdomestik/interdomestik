import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminUsersReadRecovery } from './admin-users-read-recovery';

// Unit tests control transition pending; mounted Next proves actual refresh settlement.
const state = vi.hoisted(() => ({
  pending: false,
  refresh: vi.fn(),
  start: vi.fn((callback: () => void) => callback()),
}));
vi.mock('react', async original => ({
  ...(await original<typeof import('react')>()),
  useTransition: () => [state.pending, state.start],
}));
vi.mock('@/i18n/routing', () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'loading' ? 'Duke u ngarkuar...' : 'Provo përsëri',
}));

const content = (message: string | null) => (
  <>
    <h1 id="admin-users-heading">Users</h1>
    <input aria-label="Search" />
    <AdminUsersReadRecovery message={message}>
      <p>Rows or valid empty</p>
    </AdminUsersReadRecovery>
  </>
);

describe('AdminUsersReadRecovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.pending = false;
  });

  it('refreshes current route once, announces localized pending and rejects repeat activation', () => {
    const view = render(content('Read failed'));
    const retry = screen.getByRole('button', { name: 'Provo përsëri' });
    act(() => retry.focus());
    fireEvent.click(retry);
    expect(state.refresh).toHaveBeenCalledOnce();
    state.pending = true;
    view.rerender(content('Read failed'));
    expect(retry).toHaveFocus();
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Duke u ngarkuar...');
    fireEvent.click(retry);
    expect(state.refresh).toHaveBeenCalledOnce();
    state.pending = false;
    view.rerender(content('Read failed'));
    expect(retry).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Read failed');
    fireEvent.click(retry);
    expect(state.refresh).toHaveBeenCalledTimes(2);
  });

  it('keeps initial success unfocused and transfers only owned retry focus to the recovered region', () => {
    const view = render(content(null));
    expect(screen.getByTestId('admin-users-read-region')).not.toHaveFocus();
    view.rerender(content('Read failed'));
    const retry = screen.getByRole('button');
    act(() => retry.focus());
    fireEvent.click(retry);
    view.rerender(content(null));
    expect(screen.getByTestId('admin-users-read-region')).toHaveFocus();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Rows or valid empty')).toBeInTheDocument();
  });

  it('does not restore keyboard focus after a pointer retry and resets prior retry status', () => {
    const view = render(content('Read failed'));
    const retry = screen.getByRole('button');
    act(() => retry.focus());
    fireEvent.pointerDown(retry);
    fireEvent.click(retry, { detail: 1 });
    view.rerender(content(null));
    expect(screen.getByTestId('admin-users-read-region')).not.toHaveFocus();
    view.rerender(content('Later failure'));
    expect(screen.getByRole('alert')).toHaveTextContent('Later failure');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it.each(['focus', 'pointer', 'tab'])(
    'does not steal focus after newer %s interaction',
    interaction => {
      const view = render(content('Read failed'));
      const retry = screen.getByRole('button');
      act(() => retry.focus());
      fireEvent.click(retry);
      const search = screen.getByRole('textbox');
      if (interaction === 'focus') act(() => search.focus());
      if (interaction === 'pointer') fireEvent.pointerDown(search);
      if (interaction === 'tab') fireEvent.keyDown(retry, { key: 'Tab' });
      view.rerender(content(null));
      expect(screen.getByTestId('admin-users-read-region')).not.toHaveFocus();
      if (interaction === 'focus') expect(search).toHaveFocus();
    }
  );

  it('keeps the admin users association and test ids by default', () => {
    render(content('Read failed'));
    const region = screen.getByTestId('admin-users-read-region');
    expect(region).toHaveAttribute('aria-labelledby', 'admin-users-heading');
    expect(screen.getByRole('region', { name: 'Users' })).toBe(region);
    expect(screen.getByTestId('admin-users-read-recovery')).toContainElement(
      screen.getByRole('alert')
    );
  });

  it('keeps the default Users presentation and opts claims into narrow wrapping only', () => {
    const view = render(content('Read failed'));
    const usersRecovery = screen.getByTestId('admin-users-read-recovery');
    const usersRetry = screen.getByRole('button', { name: 'Provo përsëri' });
    expect(usersRecovery).toHaveClass('p-4');
    expect(usersRecovery).not.toHaveClass('p-2');
    expect(usersRetry).toHaveClass('shrink-0');
    expect(usersRetry).not.toHaveClass('whitespace-normal');
    view.unmount();

    render(
      <AdminUsersReadRecovery message="Read failed" narrowPresentation>
        <p>Claims content</p>
      </AdminUsersReadRecovery>
    );
    const retry = screen.getByRole('button', { name: 'Provo përsëri' });
    expect(screen.getByTestId('admin-users-read-recovery')).toHaveClass('p-2', 'sm:p-4');
    expect(retry).toHaveClass(
      'max-sm:h-auto',
      'max-sm:min-h-10',
      'max-sm:max-w-full',
      'max-sm:whitespace-normal'
    );
    fireEvent.click(retry);
    expect(state.refresh).toHaveBeenCalledOnce();
  });

  it('accepts configurable heading and test ids for the claims consumer', () => {
    render(
      <>
        <h1 id="admin-claims-heading">Claims</h1>
        <AdminUsersReadRecovery
          message="Read failed"
          headingId="admin-claims-heading"
          regionTestId="admin-claims-read-region"
          recoveryTestId="admin-claims-read-recovery"
        >
          <p>Claims content</p>
        </AdminUsersReadRecovery>
      </>
    );
    const region = screen.getByTestId('admin-claims-read-region');
    expect(region).toHaveAttribute('aria-labelledby', 'admin-claims-heading');
    expect(screen.getByRole('region', { name: 'Claims' })).toBe(region);
    expect(screen.getByTestId('admin-claims-read-recovery')).toContainElement(
      screen.getByRole('button', { name: 'Provo përsëri' })
    );
    expect(screen.queryByTestId('admin-users-read-region')).not.toBeInTheDocument();
    expect(screen.queryByTestId('admin-users-read-recovery')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Provo përsëri' }));
    expect(state.refresh).toHaveBeenCalledOnce();
  });
});
