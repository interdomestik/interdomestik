import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ leave: vi.fn(), refresh: vi.fn() }));
vi.mock('@/app/[locale]/(app)/member/membership/leave-sponsorship.core', () => ({
  leaveCompanyProgramme: h.leave,
}));
vi.mock('@/i18n/routing', () => ({ useRouter: () => ({ refresh: h.refresh }) }));
import { LeaveCompanyProgramme } from './leave-company-programme';
const t = (key: string): string => key;

describe('leave programme confirmation', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });
  it('requires a confirmation, announces success and refreshes', async () => {
    h.leave.mockResolvedValue({ ok: true });
    render(<LeaveCompanyProgramme entryId="mine" t={t} />);
    fireEvent.click(screen.getByRole('button', { name: 'sponsorCoverage.leave' }));
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('sponsorCoverage.confirm_body');
    expect(h.leave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'sponsorCoverage.confirm' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('sponsorCoverage.success')
    );
    expect(h.leave).toHaveBeenCalledWith({ entryId: 'mine' });
    expect(h.refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: 'sponsorCoverage.leave' })).toBeDisabled();
  });
  it('allows keeping membership without calling the action', () => {
    render(<LeaveCompanyProgramme entryId="mine" t={t} />);
    fireEvent.click(screen.getByRole('button', { name: 'sponsorCoverage.leave' }));
    fireEvent.click(screen.getByRole('button', { name: 'sponsorCoverage.keep' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(h.leave).not.toHaveBeenCalled();
  });
  it.each(['not_found', 'error', 'forbidden'])('announces %s and permits retry', async error => {
    h.leave.mockResolvedValue({ ok: false, error });
    render(<LeaveCompanyProgramme entryId="mine" t={t} />);
    fireEvent.click(screen.getByRole('button', { name: 'sponsorCoverage.leave' }));
    fireEvent.click(screen.getByRole('button', { name: 'sponsorCoverage.confirm' }));
    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent(
        `sponsorCoverage.${error === 'not_found' ? 'not_found' : 'error'}`
      )
    );
    expect(h.refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'sponsorCoverage.leave' })).toBeEnabled();
  });
  it('disables confirmation while pending and prevents duplicate writes', async () => {
    let complete: ((value: { ok: true }) => void) | undefined;
    h.leave.mockReturnValue(
      new Promise(resolve => {
        complete = resolve;
      })
    );
    render(<LeaveCompanyProgramme entryId="mine" t={t} />);
    fireEvent.click(screen.getByRole('button', { name: 'sponsorCoverage.leave' }));
    fireEvent.click(screen.getByRole('button', { name: 'sponsorCoverage.confirm' }));
    const pending = screen.getByRole('button', { name: 'sponsorCoverage.pending' });
    expect(pending).toBeDisabled();
    fireEvent.click(pending);
    expect(h.leave).toHaveBeenCalledOnce();
    complete?.({ ok: true });
    await waitFor(() => expect(h.refresh).toHaveBeenCalledOnce());
  });
});
