import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getUserChoices } from '@/actions/admin-users';
import { grantUserRole, listBranches } from '@/actions/admin-rbac.core';
import { AddAgentDialog } from './add-agent-dialog';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/actions/admin-users', () => ({
  getUserChoices: vi.fn(),
}));

vi.mock('@/actions/admin-rbac.core', () => ({
  grantUserRole: vi.fn(),
  listBranches: vi.fn(),
}));

const mockedGetUserChoices = vi.mocked(getUserChoices);
const mockedListBranches = vi.mocked(listBranches);
const mockedGrantUserRole = vi.mocked(grantUserRole);

beforeEach(() => {
  mockedGetUserChoices.mockReset();
  mockedListBranches.mockReset();
  mockedGrantUserRole.mockReset();
});

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  'scrollIntoView'
);
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
afterAll(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView);
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
});

async function selectOption(label: string, name: string) {
  const select = screen.getByRole('combobox', { name: `admin.users_page.${label}` });
  await waitFor(() => expect(select).not.toBeDisabled());
  fireEvent.keyDown(select, { key: 'ArrowDown' });
  fireEvent.click(await screen.findByRole('option', { name }));
}

describe('AddAgentDialog', () => {
  it('performs zero option reads before the dialog is opened', () => {
    mockedGetUserChoices.mockResolvedValue({ success: true, data: [] } as never);
    mockedListBranches.mockResolvedValue({ success: true, data: [] } as never);

    render(<AddAgentDialog search="ana" />);

    expect(mockedGetUserChoices).not.toHaveBeenCalled();
    expect(mockedListBranches).not.toHaveBeenCalled();
  });

  it('keeps Confirm disabled while options are loading, and still disabled without a selection once ready', async () => {
    let resolveUsers!: (value: unknown) => void;
    let resolveBranches!: (value: unknown) => void;
    mockedGetUserChoices.mockReturnValue(
      new Promise(resolve => {
        resolveUsers = resolve;
      }) as never
    );
    mockedListBranches.mockReturnValue(
      new Promise(resolve => {
        resolveBranches = resolve;
      }) as never
    );

    render(<AddAgentDialog search="ana" />);
    fireEvent.click(screen.getByRole('button', { name: 'admin.users_page.add_agent' }));

    expect(screen.getByRole('status')).toHaveTextContent('common.loading');
    expect(screen.getByRole('button', { name: 'admin.users_page.confirm' })).toBeDisabled();
    expect(screen.getByText('admin.users_page.select_user')).toBeInTheDocument();

    await act(async () => {
      resolveUsers({
        success: true,
        data: [{ id: '1', name: 'Ana', email: 'ana@example.com', role: 'user' }],
      });
      resolveBranches({ success: true, data: [{ id: 'b1', name: 'Branch One' }] });
    });

    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'admin.users_page.confirm' })).toBeDisabled();
  });

  it('shows a localized error with retry when option loading fails, and keeps the dialog closable', async () => {
    mockedGetUserChoices.mockResolvedValue({ success: false, error: 'forbidden' } as never);
    mockedListBranches.mockResolvedValue({ success: true, data: [] } as never);

    render(<AddAgentDialog search="ana" />);
    fireEvent.click(screen.getByRole('button', { name: 'admin.users_page.add_agent' }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('common.errors.generic')
    );
    expect(screen.getByRole('button', { name: 'admin.users_page.confirm' })).toBeDisabled();

    const cancelButton = screen.getByRole('button', { name: 'admin.users_page.cancel' });
    expect(cancelButton).not.toBeDisabled();
    fireEvent.click(cancelButton);
  });
  it('grants only a current selected candidate and blocks a stale selection after search reload', async () => {
    let resolveReload!: (value: Awaited<ReturnType<typeof getUserChoices>>) => void;
    mockedGetUserChoices
      .mockResolvedValueOnce({
        success: true,
        data: [
          { id: 'staff-1', name: 'Staff Candidate', email: 'staff@example.com', role: 'staff' },
        ],
      } as never)
      .mockReturnValueOnce(
        new Promise(resolve => {
          resolveReload = resolve;
        })
      );
    mockedListBranches.mockResolvedValue({
      success: true,
      data: [{ id: 'b1', name: 'Branch One' }],
    } as never);
    mockedGrantUserRole.mockResolvedValue({
      success: false,
      error: 'forbidden',
      code: 'FORBIDDEN',
    } as never);
    const { rerender } = render(<AddAgentDialog search="staff" />);
    fireEvent.click(screen.getByRole('button', { name: 'admin.users_page.add_agent' }));
    await selectOption('select_user', 'Staff Candidate');
    await selectOption('select_branch', 'Branch One');
    const confirm = screen.getByRole('button', { name: 'admin.users_page.confirm' });
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mockedGrantUserRole).toHaveBeenCalledExactlyOnceWith({
        userId: 'staff-1',
        role: 'agent',
        branchId: 'b1',
      })
    );
    await waitFor(() => expect(confirm).not.toBeDisabled());
    mockedGrantUserRole.mockClear();
    rerender(<AddAgentDialog search="member" />);
    expect(confirm).toBeDisabled();
    await act(async () => {
      fireEvent.submit(confirm.closest('form')!);
    });
    expect(mockedGrantUserRole).not.toHaveBeenCalled();
    await act(async () => {
      resolveReload({
        success: true,
        data: [
          { id: 'member-1', name: 'Member Candidate', email: 'member@example.com', role: 'member' },
        ],
      } as never);
    });
    await waitFor(() => expect(screen.queryByRole('status')).not.toBeInTheDocument());
    expect(confirm).toBeDisabled();
    await act(async () => {
      fireEvent.submit(confirm.closest('form')!);
    });
    expect(mockedGrantUserRole).not.toHaveBeenCalled();
    await selectOption('select_user', 'Member Candidate');
    expect(confirm).not.toBeDisabled();
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(mockedGrantUserRole).toHaveBeenCalledExactlyOnceWith({
        userId: 'member-1',
        role: 'agent',
        branchId: 'b1',
      })
    );
  });
});
