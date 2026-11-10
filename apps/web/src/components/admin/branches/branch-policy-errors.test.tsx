import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreateBranchDialog as PageCreateBranchDialog } from '@/app/[locale]/admin/branches/components/create-branch-dialog';
import { CreateBranchDialog } from './create-branch-dialog';
import { EditBranchSheet } from './edit-branch-sheet';

const actions = vi.hoisted(() => ({ createBranch: vi.fn(), updateBranch: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('@/actions/admin-rbac', () => actions);
vi.mock('@/actions/admin-rbac.core', () => actions);
vi.mock('sonner', () => ({ toast }));

const failure = { success: false, code: 'single_branch_limit', error: 'Server-only fallback' };

describe('branch policy error and retry', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  afterEach(cleanup);

  it.each([
    {
      label: 'page dialog',
      Component: PageCreateBranchDialog,
      trigger: 'create_branch',
      submit: 'submit',
      name: 'field_name',
      code: 'field_code',
      description: true,
    },
    {
      label: 'shared dialog',
      Component: CreateBranchDialog,
      trigger: 'createButton',
      submit: 'save',
      name: 'fields.name',
      code: 'fields.code',
      description: false,
    },
  ])('$label keeps the create form usable after a localized policy denial', async entry => {
    actions.createBranch.mockResolvedValueOnce(failure).mockResolvedValueOnce({ success: true });
    render(<entry.Component />);
    fireEvent.click(screen.getByRole('button', { name: entry.trigger }));
    fireEvent.change(screen.getByLabelText(entry.name), { target: { value: 'Second Branch' } });
    fireEvent.change(screen.getByLabelText(entry.code), { target: { value: 'SECOND' } });
    const submit = screen.getByRole('button', { name: entry.submit });
    fireEvent.click(submit);
    await waitFor(() => expect(actions.createBranch).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(submit).toBeEnabled());
    if (entry.description) {
      expect(toast.error).toHaveBeenCalledWith('create_error', {
        description: 'single_branch_limit',
      });
    } else {
      expect(toast.error).toHaveBeenCalledWith('single_branch_limit');
    }
    expect(screen.getByLabelText(entry.name)).toHaveValue('Second Branch');
    fireEvent.click(submit);
    await waitFor(() => expect(actions.createBranch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps reactivation editable after a localized policy denial, then allows retry', async () => {
    actions.updateBranch.mockResolvedValueOnce(failure).mockResolvedValueOnce({ success: true });
    const onUpdate = vi.fn();
    const onClose = vi.fn();
    render(
      <EditBranchSheet
        branch={{ id: 'branch-2', name: 'Second', code: 'B2', isActive: false }}
        isOpen
        onUpdate={onUpdate}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('checkbox'));
    const submit = screen.getByRole('button', { name: 'save' });
    fireEvent.click(submit);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('single_branch_limit'));
    await waitFor(() => expect(submit).toBeEnabled());
    expect(onClose).not.toHaveBeenCalled();
    expect(onUpdate).not.toHaveBeenCalled();
    fireEvent.click(submit);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onUpdate).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }));
  });
});
