import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sponsorAction } from './actions';
import { context, actionForm } from './test-fixtures';

const mocks = vi.hoisted(() => ({ context: vi.fn(), run: vi.fn(), revalidate: vi.fn() }));
vi.mock('./context.core', () => ({ sponsorContext: mocks.context }));
vi.mock('./actions.core', () => ({ runSponsorAction: mocks.run }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue(context);
});
describe('sponsor action entry', () => {
  it('obtains authority on every request and refreshes all three sponsor layouts after success', async () => {
    mocks.run.mockResolvedValue({ ok: true });
    const form = actionForm();
    expect(await sponsorAction('createSponsor', null, form)).toEqual({ ok: true });
    expect(mocks.context).toHaveBeenCalledOnce();
    expect(mocks.run).toHaveBeenCalledWith(context, 'createSponsor', form);
    expect(mocks.revalidate.mock.calls).toEqual([
      ['/[locale]/(agent)/agent/sponsors', 'layout'],
      ['/[locale]/admin/sponsors', 'layout'],
      ['/[locale]/(staff)/staff/sponsors', 'layout'],
    ]);
  });
  it('does not revalidate refusals or expose internal errors', async () => {
    mocks.run.mockResolvedValue({ ok: false, error: 'forbidden' });
    expect(await sponsorAction('createSponsor', null, actionForm())).toEqual({
      ok: false,
      error: 'forbidden',
    });
    mocks.context.mockRejectedValue(new Error('sensitive internal details'));
    expect(await sponsorAction('createSponsor', null, actionForm())).toEqual({
      ok: false,
      error: 'unavailable',
    });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
