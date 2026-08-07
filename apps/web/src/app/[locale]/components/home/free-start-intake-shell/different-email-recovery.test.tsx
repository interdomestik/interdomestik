import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DifferentEmailRecovery } from './different-email-recovery';

const actions = vi.hoisted(() => ({ confirm: vi.fn(), start: vi.fn(), submit: vi.fn() }));
const refresh = vi.hoisted(() => vi.fn());
const copy = {
  body: 'Verify both mailboxes before changing the sign-in email.',
  close: 'Cancel',
  codeLabel: 'Verification code',
  complete: 'Email changed. Your saved drafts stay with the same account.',
  confirm: 'Confirm replacement email',
  currentBody: 'Enter the code sent to your original mailbox and the new email.',
  currentHeading: 'Verify original email',
  emailLabel: 'New email',
  error: 'Recovery is unavailable. Nothing changed.',
  heading: 'Use a different email',
  open: 'Use a different email',
  pending: 'Checking…',
  replacementBody: 'Enter the code sent to the replacement mailbox.',
  replacementHeading: 'Verify replacement email',
  start: 'Send code to original email',
  submitCurrent: 'Verify and send replacement code',
};

vi.mock('@/actions/different-email-recovery', () => ({
  confirmReplacementEmail: actions.confirm,
  startDifferentEmailRecovery: actions.start,
  submitCurrentEmailProof: actions.submit,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => ({
    raw: () => JSON.stringify({ manage: { differentEmailRecovery: copy } }),
  }),
}));

describe('IDA-UI03b different-email recovery', () => {
  it('keeps the three stages explicit, generic and keyboard accessible', async () => {
    actions.start.mockResolvedValue({ ok: true, stage: 'current' });
    actions.submit.mockResolvedValue({ ok: true, stage: 'replacement' });
    actions.confirm.mockResolvedValue({ ok: true, stage: 'complete' });
    render(<DifferentEmailRecovery />);
    fireEvent.click(screen.getByRole('button', { name: copy.open }));
    fireEvent.click(screen.getByRole('button', { name: copy.start }));
    expect(await screen.findByRole('heading', { name: copy.currentHeading })).toBeVisible();
    fireEvent.change(screen.getByLabelText(copy.codeLabel), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(copy.emailLabel), {
      target: { value: 'new@example.com' },
    });
    fireEvent.submit(screen.getByRole('button', { name: copy.submitCurrent }).closest('form')!);
    expect(await screen.findByRole('heading', { name: copy.replacementHeading })).toBeVisible();
    fireEvent.change(screen.getByLabelText(copy.codeLabel), { target: { value: '654321' } });
    fireEvent.submit(screen.getByRole('button', { name: copy.confirm }).closest('form')!);
    expect(await screen.findByRole('status')).toHaveTextContent(copy.complete);
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('does not advance or disclose the target on a generic failure', async () => {
    actions.start.mockResolvedValue({ ok: true, stage: 'current' });
    actions.submit.mockResolvedValue({ ok: false, code: 'unavailable' });
    render(<DifferentEmailRecovery />);
    fireEvent.click(screen.getByRole('button', { name: copy.open }));
    fireEvent.click(screen.getByRole('button', { name: copy.start }));
    await screen.findByRole('heading', { name: copy.currentHeading });
    fireEvent.change(screen.getByLabelText(copy.codeLabel), { target: { value: '123456' } });
    fireEvent.change(screen.getByLabelText(copy.emailLabel), {
      target: { value: 'private@example.com' },
    });
    fireEvent.submit(screen.getByRole('button', { name: copy.submitCurrent }).closest('form')!);
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);
    expect(screen.queryByText('private@example.com')).not.toBeInTheDocument();
    await waitFor(() => expect(actions.submit).toHaveBeenCalledOnce());
  });

  it('clears the replacement address when recovery is cancelled', async () => {
    actions.start.mockResolvedValue({ ok: true, stage: 'current' });
    render(<DifferentEmailRecovery />);
    fireEvent.click(screen.getByRole('button', { name: copy.open }));
    fireEvent.click(screen.getByRole('button', { name: copy.start }));
    await screen.findByRole('heading', { name: copy.currentHeading });
    fireEvent.change(screen.getByLabelText(copy.emailLabel), {
      target: { value: 'private@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: copy.close }));
    fireEvent.click(screen.getByRole('button', { name: copy.open }));
    fireEvent.click(screen.getByRole('button', { name: copy.start }));
    await screen.findByRole('heading', { name: copy.currentHeading });
    expect(screen.getByLabelText(copy.emailLabel)).toHaveValue('');
  });
});
