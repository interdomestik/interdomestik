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
});
