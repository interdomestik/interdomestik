import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  logActivity: vi.fn(),
  logLeadActivity: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/actions/activities', () => ({
  logActivity: hoisted.logActivity,
  logLeadActivity: hoisted.logLeadActivity,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: hoisted.refresh }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => `t:${key}` }));
vi.mock('sonner', () => ({
  toast: { error: hoisted.toastError, success: hoisted.toastSuccess },
}));

import { LogActivityDialog } from './log-activity-dialog';

async function submitActivity(): Promise<void> {
  render(<LogActivityDialog entityId="member-1" />);
  fireEvent.click(screen.getByRole('button', { name: 't:trigger' }));
  fireEvent.change(await screen.findByPlaceholderText('t:fields.subject.placeholder'), {
    target: { value: 'Follow-up call' },
  });
  fireEvent.click(screen.getByRole('button', { name: 't:save' }));
}

describe('LogActivityDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('treats a success result with an undefined error as saved and refreshes the feed', async () => {
    hoisted.logActivity.mockResolvedValue({ success: true, error: undefined });
    await submitActivity();

    await waitFor(() => expect(hoisted.toastSuccess).toHaveBeenCalledWith('t:success'));
    expect(hoisted.toastError).not.toHaveBeenCalled();
    expect(hoisted.refresh).toHaveBeenCalledTimes(1);
    expect(hoisted.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ memberId: 'member-1', subject: 'Follow-up call', type: 'call' })
    );
    await waitFor(() =>
      expect(screen.queryByPlaceholderText('t:fields.subject.placeholder')).toBeNull()
    );
  });

  it('names the corner close button with the localized label', async () => {
    render(<LogActivityDialog entityId="member-1" />);
    fireEvent.click(screen.getByRole('button', { name: 't:trigger' }));
    expect(await screen.findByRole('button', { name: 't:close' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
  });

  it('shows the localized error instead of the raw server text and keeps the dialog open', async () => {
    hoisted.logActivity.mockResolvedValue({ success: false, error: 'Member access denied' });
    await submitActivity();

    await waitFor(() => expect(hoisted.toastError).toHaveBeenCalledWith('t:error'));
    expect(hoisted.toastSuccess).not.toHaveBeenCalled();
    expect(hoisted.refresh).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('t:fields.subject.placeholder')).toBeVisible();
  });
});
