import { describe, expect, it } from 'vitest';
import { saved, setup, snap, tick } from './tests/account-draft-write-queue-fixtures';

describe('known divergent create retirement', () => {
  it('holds only a known divergent create replay open for deliberate recovery', async () => {
    const row = { ...saved, version: 2, summary: 'Intervening tab facts.' };
    const h = setup({
      create: async call => {
        if (call === 1) throw new Error('response lost');
        return { ok: true, draft: row };
      },
    });
    h.queue.enqueue(snap('a'));
    await tick();
    expect(await h.queue.retire(true)).toBe(false);
    h.queue.retry();
    await tick();
    expect(h.states.at(-1)).toBe('conflict');
    expect(await h.queue.retire()).toBe(false);
    expect(await h.queue.retire(true)).toBe('recovering');
    h.queue.enqueue(snap('b'));
    h.queue.retry();
    await tick();
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.create.mock.calls[1]![0]).toEqual(h.create.mock.calls[0]![0]);
    expect(h.update).not.toHaveBeenCalled();
    expect(h.acks).not.toHaveBeenCalled();
    expect(h.queue.getDraft()).toBeNull();
    expect(h.queue.adopt(row)).toBe(true);
    h.queue.enqueue(snap('c'));
    expect(await h.queue.drain()).toBe(true);
    expect(h.update).toHaveBeenCalledOnce();
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: row.id, expectedVersion: 2, summary: 'c' })
    );
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(await h.queue.retire(true)).toBe(true);
  });
});
