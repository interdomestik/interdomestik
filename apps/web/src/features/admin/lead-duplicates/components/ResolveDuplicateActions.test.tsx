import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  resolveLeadDuplicateAction: vi.fn(),
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../actions/lead-duplicates', () => ({
  resolveLeadDuplicateAction: hoisted.resolveLeadDuplicateAction,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: hoisted.refresh }) }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('sonner', () => ({
  toast: { error: hoisted.toastError, success: hoisted.toastSuccess },
}));

import { ResolveDuplicateActions } from './ResolveDuplicateActions';

const keep = () => screen.getByTestId('duplicate-keep-ref-1');
const dismiss = () => screen.getByTestId('duplicate-dismiss-ref-1');

describe('ResolveDuplicateActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('records the chosen outcome, confirms it and reloads the queue', async () => {
    hoisted.resolveLeadDuplicateAction.mockResolvedValue({ success: true, data: {} });
    render(<ResolveDuplicateActions referralId="ref-1" />);

    fireEvent.click(dismiss());

    await waitFor(() => expect(hoisted.refresh).toHaveBeenCalledTimes(1));
    expect(hoisted.resolveLeadDuplicateAction).toHaveBeenCalledWith({
      referralId: 'ref-1',
      outcome: 'dismissed',
    });
    expect(hoisted.toastSuccess).toHaveBeenCalledWith('toast_resolved');
  });

  it('reloads when another reviewer already resolved it differently', async () => {
    hoisted.resolveLeadDuplicateAction.mockResolvedValue({
      success: false,
      code: 'ALREADY_RESOLVED',
      error: 'x',
    });
    render(<ResolveDuplicateActions referralId="ref-1" />);

    fireEvent.click(keep());

    await waitFor(() => expect(hoisted.refresh).toHaveBeenCalledTimes(1));
    expect(hoisted.toastError).toHaveBeenCalledWith('toast_already_resolved');
  });

  it('keeps the row actionable after a failure so the reviewer can retry', async () => {
    hoisted.resolveLeadDuplicateAction
      .mockResolvedValueOnce({ success: false, code: 'NOT_FOUND', error: 'x' })
      .mockResolvedValueOnce({ success: true, data: {} });
    render(<ResolveDuplicateActions referralId="ref-1" />);

    fireEvent.click(keep());
    await waitFor(() => expect(hoisted.toastError).toHaveBeenCalledWith('toast_error'));
    expect(hoisted.refresh).not.toHaveBeenCalled();
    await waitFor(() => expect(keep()).not.toBeDisabled());

    fireEvent.click(keep());
    await waitFor(() => expect(hoisted.refresh).toHaveBeenCalledTimes(1));
    expect(hoisted.resolveLeadDuplicateAction).toHaveBeenCalledTimes(2);
  });
});
