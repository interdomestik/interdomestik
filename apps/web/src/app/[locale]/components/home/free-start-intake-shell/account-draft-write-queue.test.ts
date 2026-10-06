import { describe, expect, it } from 'vitest';
import { type DraftWriteResult } from './account-draft-write-queue';

import {
  context,
  REQUEST_ID,
  saved,
  snap,
  tick,
  fail,
  held,
  setup,
  okCreate,
  okUpdate,
} from './tests/account-draft-write-queue-fixtures';

describe('account draft write queue', () => {
  it('carries the acknowledged version to one queued update and only then reports saved', async () => {
    const create = held<DraftWriteResult>();
    const h = setup({ create: () => create.promise });
    h.queue.enqueue(snap('a'));
    h.queue.enqueue(snap('b'));
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.update).not.toHaveBeenCalled();
    create.resolve({ ok: true, draft: saved });
    await tick();
    expect(h.acks).toHaveBeenNthCalledWith(1, saved, 'a', false);
    expect(h.update).toHaveBeenCalledOnce();
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: saved.id,
        expectedVersion: 1,
        summary: 'b',
        expectedContext: context,
      })
    );
    expect(h.acks).toHaveBeenNthCalledWith(2, expect.objectContaining({ version: 2 }), 'b', true);
    expect(h.states).toEqual(['saving', 'dirty', 'saving', 'saved']);
  });

  it('retries the original lost create with the same request id, then updates with newer facts', async () => {
    const h = setup({
      create: async call => {
        if (call === 1) throw new Error('response lost');
        return { ok: true, draft: saved };
      },
    });
    h.queue.enqueue(snap('a'));
    await tick();
    h.queue.enqueue(snap('b'));
    await tick();
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.states.at(-1)).toBe('error');
    h.queue.retry();
    await tick();
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.create.mock.calls[1]![0]).toEqual(h.create.mock.calls[0]![0]);
    expect(h.create).toHaveBeenLastCalledWith(
      expect.objectContaining({ clientRequestId: REQUEST_ID, summary: 'a' })
    );
    expect(h.update).toHaveBeenCalledOnce();
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 1, summary: 'b' })
    );
    expect(await h.queue.drain()).toBe(true);
  });

  it.each([
    { version: 2, summary: 'Intervening tab facts.' },
    { version: 1, summary: 'Different acknowledged facts.' },
  ])(
    'preserves a newer editor when an uncertain create returns changed row $version',
    async row => {
      const h = setup({
        create: async call => {
          if (call === 1) throw new Error('response lost');
          return { ok: true, draft: { ...saved, ...row } };
        },
      });
      h.queue.enqueue(snap('a'));
      await tick();
      h.queue.enqueue(snap('b'));
      h.queue.retry();
      await tick();
      expect(h.create.mock.calls[1]![0]).toEqual(h.create.mock.calls[0]![0]);
      expect(h.states.at(-1)).toBe('conflict');
      expect(h.acks).not.toHaveBeenCalled();
      expect(h.update).not.toHaveBeenCalled();
      h.queue.enqueue(snap('c'));
      h.queue.retry();
      await tick();
      expect(h.update).not.toHaveBeenCalled();
      expect(await h.queue.drain()).toBe(false);
    }
  );

  it('captures ownership by value before a caller changes its context object', async () => {
    const create = held<DraftWriteResult>();
    const mutable = { ...context };
    const h = setup({ create: () => create.promise }, mutable);
    h.queue.enqueue(snap('a'));
    mutable.ownerUserId = 'owner-b';
    h.queue.enqueue(snap('b'));
    create.resolve({ ok: true, draft: saved });
    await h.queue.drain();
    expect(h.create.mock.calls[0]![0].expectedContext).toEqual(context);
    expect(h.update.mock.calls[0]![0].expectedContext).toEqual(context);
  });

  it('suppresses a disposed owner receipt without releasing an independent queue', async () => {
    const a = held<DraftWriteResult>();
    const owner = setup({ create: () => a.promise });
    const b = held<DraftWriteResult>();
    const next = setup({ create: () => b.promise });
    owner.queue.enqueue(snap('a'));
    owner.queue.enqueue(snap('b'));
    owner.queue.dispose();
    next.queue.enqueue(snap('x'));
    a.resolve({ ok: true, draft: saved });
    await tick();
    expect(owner.acks).not.toHaveBeenCalled();
    expect(owner.update).not.toHaveBeenCalled();
    expect(owner.states).toEqual(['saving']);
    expect(owner.queue.getDraft()).toBeNull();
    expect(await owner.queue.drain()).toBe(false);
    b.resolve({ ok: true, draft: { ...saved, id: 'other-draft' } });
    await tick();
    expect(next.acks).toHaveBeenCalledOnce();
    expect(next.states).toEqual(['saving', 'saved']);
  });

  it('retire waits for the dispatched create, cancels queued work and permits reset', async () => {
    const create = held<DraftWriteResult>();
    const h = setup({ create: () => create.promise });
    h.queue.enqueue(snap('a'));
    h.queue.enqueue(snap('b'));
    let settled = false;
    const retired = h.queue.retire().then(value => {
      settled = true;
      return value;
    });
    await tick();
    expect(settled).toBe(false);
    create.resolve({ ok: true, draft: saved });
    expect(await retired).toBe(true);
    expect(h.queue.getDraft()).toEqual(saved);
    expect(h.acks).toHaveBeenCalledOnce();
    expect(h.update).not.toHaveBeenCalled();
    h.queue.enqueue(snap('c'));
    await tick();
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.update).not.toHaveBeenCalled();
    expect(h.states).toEqual(['saving']);
  });

  it('refuses retire after a lost create until an explicit retry recovers identity', async () => {
    const h = setup({ create: call => (call === 1 ? fail('unavailable')() : okCreate()) });
    h.queue.enqueue(snap('a'));
    await tick();
    h.queue.enqueue(snap('b'));
    expect(await h.queue.retire()).toBe(false);
    expect(h.queue.getDraft()).toBeNull();
    expect(h.create).toHaveBeenCalledOnce();
    h.queue.retry();
    expect(await h.queue.drain()).toBe(true);
    expect(h.create).toHaveBeenCalledTimes(2);
    expect(h.create).toHaveBeenLastCalledWith(expect.objectContaining({ summary: 'a' }));
    expect(h.update).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 1, summary: 'b' })
    );
    expect(await h.queue.retire()).toBe(true);
  });

  it('stops automatic and explicit retries after a CAS conflict until adopt', async () => {
    const h = setup({
      update: (call, payload) => (call === 1 ? fail('conflict')() : okUpdate(call, payload)),
    });
    h.queue.enqueue(snap('a'));
    expect(await h.queue.drain()).toBe(true);
    h.queue.enqueue(snap('b'));
    await tick();
    expect(h.states.at(-1)).toBe('conflict');
    h.queue.enqueue(snap('c'));
    h.queue.retry();
    await tick();
    expect(h.update).toHaveBeenCalledOnce();
    expect(await h.queue.drain()).toBe(false);
    expect(h.queue.adopt({ ...saved, version: 5 })).toBe(true);
    h.queue.enqueue(snap('d'));
    await tick();
    expect(h.update).toHaveBeenCalledTimes(2);
    expect(h.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedVersion: 5, summary: 'd' })
    );
  });

  it('never falls back to create when an update target is missing', async () => {
    const h = setup({ update: fail('notFound') });
    h.queue.enqueue(snap('a'));
    await h.queue.drain();
    h.queue.enqueue(snap('b'));
    await tick();
    expect(h.states.at(-1)).toBe('error');
    h.queue.retry();
    await tick();
    expect(h.update).toHaveBeenCalledTimes(2);
    expect(h.create).toHaveBeenCalledOnce();
    expect(h.queue.getDraft()?.id).toBe(saved.id);
  });

  it('reports definite create failures without claiming uncertainty', async () => {
    const h = setup({ create: fail('limitReached') });
    h.queue.enqueue(snap('a'));
    expect(await h.queue.drain()).toBe(false);
    expect(h.states).toEqual(['saving', 'limit']);
    expect(await h.queue.retire()).toBe(true);
  });

  it('refuses adopt while a write is pending and accepts it once settled', async () => {
    const create = held<DraftWriteResult>();
    const h = setup({ create: () => create.promise });
    h.queue.enqueue(snap('a'));
    expect(h.queue.adopt(saved)).toBe(false);
    expect(h.queue.getDraft()).toBeNull();
    create.resolve({ ok: true, draft: saved });
    await h.queue.drain();
    const resumed = { ...saved, id: 'resumed-draft', version: 3 };
    expect(h.queue.adopt(resumed)).toBe(true);
    expect(h.queue.getDraft()).toEqual(resumed);
    expect(h.create).toHaveBeenCalledOnce();
  });

  it('drains true only after the latest snapshot is acknowledged', async () => {
    const create = held<DraftWriteResult>();
    const update = held<DraftWriteResult>();
    const h = setup({ create: () => create.promise, update: () => update.promise });
    h.queue.enqueue(snap('a'));
    h.queue.enqueue(snap('b'));
    let drained: boolean | undefined;
    void h.queue.drain().then(value => {
      drained = value;
    });
    create.resolve({ ok: true, draft: saved });
    await tick();
    expect(h.update).toHaveBeenCalledOnce();
    expect(drained).toBeUndefined();
    update.resolve({ ok: true, draft: { ...saved, summary: 'b', version: 2 } });
    await tick();
    expect(drained).toBe(true);
  });
  it.each([
    { original: 'Cafe\u0301', acknowledged: 'Café' },
    { original: 'First\r\nSecond', acknowledged: 'First\nSecond' },
  ])(
    'recovers a lost create receipt with canonicalized counterparty $acknowledged',
    async value => {
      const h = setup({
        create: async call => {
          if (call === 1) throw new Error('response lost');
          return { ok: true, draft: { ...saved, counterparty: value.acknowledged } };
        },
      });
      h.queue.enqueue({
        fingerprint: 'original',
        payload: { ...snap('a').payload, counterparty: value.original },
      });
      await tick();
      h.queue.retry();
      expect(await h.queue.drain()).toBe(true);
      expect(h.states.at(-1)).toBe('saved');
      expect(h.create.mock.calls[1]![0]).toEqual(h.create.mock.calls[0]![0]);
      expect(h.update).not.toHaveBeenCalled();
    }
  );
});
