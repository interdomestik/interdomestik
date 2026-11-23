import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ctx, hoisted, row } from './verify-attempt.test-support';
import { verifyCashAttemptCore } from './verify-attempt';

describe('verifyCashAttemptCore notice', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.updates.length = 0;
    hoisted.decidedRows.mockResolvedValue([{ id: 'att-1' }]);
    hoisted.selectRows.mockResolvedValue(row('pending'));
  });

  it.each(['needs_info', 'reject'] as const)(
    'sends the %s notice once, after the decision transaction has ended',
    async decision => {
      const seenInTransaction: boolean[] = [];
      hoisted.notify.mockImplementation(async () => {
        seenInTransaction.push(hoisted.inTransaction);
        return { success: true };
      });

      const result = await verifyCashAttemptCore(ctx, { attemptId: 'att-1', decision, note: 'n' });

      expect(result).toMatchObject({ success: true });
      expect(hoisted.notify).toHaveBeenCalledTimes(1);
      expect(hoisted.notify.mock.calls[0][0]).toBe('agent-1');
      expect(seenInTransaction).toEqual([false]);
    }
  );

  it('keeps the stored decision when the notice fails', async () => {
    hoisted.notify.mockRejectedValue(new Error('recipient read failed'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await verifyCashAttemptCore(ctx, {
      attemptId: 'att-1',
      decision: 'needs_info',
      note: 'n',
    });

    consoleError.mockRestore();
    expect(result).toMatchObject({ success: true, status: 'needs_info' });
  });

  it('sends no notice when the decision transaction fails', async () => {
    hoisted.decidedRows.mockRejectedValue(new Error('write failed'));

    await expect(
      verifyCashAttemptCore(ctx, { attemptId: 'att-1', decision: 'needs_info', note: 'n' })
    ).rejects.toThrow('write failed');
    expect(hoisted.notify).not.toHaveBeenCalled();
  });
});
