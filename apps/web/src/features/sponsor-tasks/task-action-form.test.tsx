import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskActionForm } from './task-action-form';

const mocks = vi.hoisted(() => ({
  evidence: vi.fn(),
  close: vi.fn(),
  acknowledge: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('./actions', () => ({
  recordEvidenceAction: mocks.evidence,
  closeHandoverAction: mocks.close,
  acknowledgeChargeAction: mocks.acknowledge,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
const forms = [
  { kind: 'evidence', action: mocks.evidence },
  { kind: 'close', action: mocks.close },
  { kind: 'acknowledge', action: mocks.acknowledge },
] as const;

function submitForm(kind: 'evidence' | 'close' | 'acknowledge'): void {
  if (kind === 'evidence') {
    fireEvent.change(screen.getByLabelText('paidUntil'), { target: { value: '2026-12-01T12:30' } });
    fireEvent.change(screen.getByLabelText('evidenceId'), { target: { value: 'txn_abc' } });
  }
  if (kind === 'close')
    fireEvent.change(screen.getByLabelText('disposition'), { target: { value: 'canceled' } });
  fireEvent.submit(screen.getByRole('button').closest('form') ?? document.body);
}

describe.each(forms)('$kind form', ({ kind, action }) => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('labels controls, submits the right identity and focuses successful results', async () => {
    action.mockResolvedValue({ ok: true });
    render(<TaskActionForm kind={kind} id="task-1" />);
    submitForm(kind);
    expect(await screen.findByText('saved')).toHaveFocus();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('button', { name: `actions.${kind}` })).toBeDisabled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    const data = action.mock.calls[0]?.[0] as FormData;
    expect(data.get(kind === 'acknowledge' ? 'chargeId' : 'intentId')).toBe('task-1');
    if (kind === 'evidence') expect(data.get('paidUntil')).toBe('2026-12-01T12:30:00Z');
    if (kind === 'close') expect(data.get('disposition')).toBe('canceled');
  });

  it.each(['forbidden', 'invalid', 'not_found', 'conflict', 'error'])(
    'shows accessible %s copy and permits retry',
    async error => {
      action.mockResolvedValue({ ok: false, error });
      render(<TaskActionForm kind={kind} id="task-1" />);
      submitForm(kind);
      expect(
        await screen.findByText(error === 'conflict' ? `conflicts.${kind}` : `errors.${error}`)
      ).toHaveFocus();
      expect(screen.getByRole('button')).toBeEnabled();
      expect(mocks.refresh).not.toHaveBeenCalled();
    }
  );

  it('contains transport failure', async () => {
    action.mockRejectedValue(new Error('offline'));
    render(<TaskActionForm kind={kind} id="task-1" />);
    submitForm(kind);
    expect(await screen.findByText('errors.error')).toHaveFocus();
  });
});
