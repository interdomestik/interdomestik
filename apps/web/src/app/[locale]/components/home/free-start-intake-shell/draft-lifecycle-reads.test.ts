import { describe, expect, it, vi } from 'vitest';

import { createDraftReadController, type DraftReadIdentity } from './draft-lifecycle-reads';

type Mutable = { -readonly [K in keyof DraftReadIdentity]: DraftReadIdentity[K] };

const identityA: DraftReadIdentity = {
  ownerUserId: 'user-a',
  tenantId: 'tenant-1',
  editorGeneration: 1,
  fingerprint: 'fp-1',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup() {
  const identity: Mutable = { ...identityA };
  const busy: boolean[] = [];
  const controller = createDraftReadController({
    current: () => identity,
    onBusy: pending => {
      busy.push(pending);
    },
  });
  return { busy, controller, identity };
}

const accepting = () => vi.fn((_value: string) => true);

describe('createDraftReadController', () => {
  it('keeps a newer read busy and accepted when an older read settles late', async () => {
    const { busy, controller } = setup();
    const list = deferred<string>();
    const resume = deferred<string>();
    const acceptList = accepting();
    const acceptResume = accepting();
    const listRun = controller.run(() => list.promise, acceptList);
    const resumeRun = controller.run(() => resume.promise, acceptResume);

    list.resolve('list');
    await expect(listRun).resolves.toBe(false);
    expect(acceptList).not.toHaveBeenCalled();
    expect(controller.isBusy()).toBe(true);
    expect(busy).toEqual([true]);

    resume.resolve('resume');
    await expect(resumeRun).resolves.toBe(true);
    expect(acceptResume).toHaveBeenCalledWith('resume');
    expect(controller.isBusy()).toBe(false);
    expect(busy).toEqual([true, false]);
  });

  it('excludes a result from another owner without notifying the new owner', async () => {
    const { busy, controller, identity } = setup();
    const read = deferred<string>();
    const accept = accepting();
    const rejected = vi.fn();
    const run = controller.run(() => read.promise, accept, rejected);

    identity.ownerUserId = 'user-b';
    read.resolve('facts-of-a');
    await expect(run).resolves.toBe(false);
    expect(accept).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();
    expect(busy).toEqual([true]);
  });

  it.each([
    ['tenantId', 'tenant-2'],
    ['editorGeneration', 2],
  ] as const)('excludes a result after %s changes', async (key, next) => {
    const { busy, controller, identity } = setup();
    const read = deferred<string>();
    const accept = accepting();
    const run = controller.run(() => read.promise, accept);

    Object.assign(identity, { [key]: next });
    read.resolve('stale');
    await expect(run).resolves.toBe(false);
    expect(accept).not.toHaveBeenCalled();
    expect(busy).toEqual([true]);
  });

  it('rejects the receipt after a newer edit but releases its own busy token', async () => {
    const { busy, controller, identity } = setup();
    const read = deferred<string>();
    const accept = accepting();
    const run = controller.run(() => read.promise, accept);

    identity.fingerprint = 'fp-2';
    read.resolve('stale');
    await expect(run).resolves.toBe(false);
    expect(accept).not.toHaveBeenCalled();
    expect(controller.isBusy()).toBe(false);
    expect(busy).toEqual([true, false]);
  });

  it('invokes no accept, rejected or busy callback after dispose', async () => {
    const { busy, controller } = setup();
    const resolved = deferred<string>();
    const rejectedRead = deferred<string>();
    const accept = accepting();
    const rejected = vi.fn();
    const first = controller.run(() => resolved.promise, accept, rejected);
    const second = controller.run(() => rejectedRead.promise, accept, rejected);

    controller.dispose();
    resolved.resolve('late');
    rejectedRead.reject(new Error('late failure'));
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(accept).not.toHaveBeenCalled();
    expect(rejected).not.toHaveBeenCalled();
    expect(busy).toEqual([true]);
    expect(controller.isBusy()).toBe(false);

    const operation = vi.fn(async () => 'x');
    await expect(controller.run(operation, accept)).resolves.toBe(false);
    expect(operation).not.toHaveBeenCalled();
  });

  it('logically supersedes a permanently hung read with a newer read', async () => {
    const { busy, controller } = setup();
    const hung = deferred<string>();
    const acceptHung = accepting();
    const old = controller.run(() => hung.promise, acceptHung);

    await expect(controller.run(async () => 'fresh', accepting())).resolves.toBe(true);
    expect(controller.isBusy()).toBe(false);
    expect(busy).toEqual([true, false]);

    hung.resolve('late');
    await expect(old).resolves.toBe(false);
    expect(acceptHung).not.toHaveBeenCalled();
    expect(busy).toEqual([true, false]);
  });

  it('lets a synchronous accept start a newer read the older run cannot release', async () => {
    const { busy, controller } = setup();
    const next = deferred<string>();
    const acceptNext = accepting();
    let second: Promise<boolean> | undefined;
    const first = controller.run(
      async () => 'one',
      () => {
        second = controller.run(() => next.promise, acceptNext);
        return true;
      }
    );

    await expect(first).resolves.toBe(false);
    expect(controller.isBusy()).toBe(true);
    expect(busy).toEqual([true]);

    next.resolve('two');
    await expect(second).resolves.toBe(true);
    expect(busy).toEqual([true, false]);
  });

  it('reports a current rejection with a fixed callback and never the raw error', async () => {
    const { busy, controller } = setup();
    const rejected = vi.fn();
    const run = controller.run(
      () => Promise.reject(new Error('provider secret')),
      accepting(),
      rejected
    );

    await expect(run).resolves.toBe(false);
    expect(rejected).toHaveBeenCalledTimes(1);
    expect(rejected).toHaveBeenCalledWith();
    expect(busy).toEqual([true, false]);
  });

  it('drops a stale rejection without a callback', async () => {
    const { controller, identity } = setup();
    const read = deferred<string>();
    const rejected = vi.fn();
    const run = controller.run(() => read.promise, accepting(), rejected);

    identity.ownerUserId = 'user-b';
    read.reject(new Error('stale failure'));
    await expect(run).resolves.toBe(false);
    expect(rejected).not.toHaveBeenCalled();
  });

  it('captures identity by value so in-place mutation cannot relabel a read', async () => {
    const { controller, identity } = setup();
    const read = deferred<string>();
    const accept = accepting();
    const run = controller.run(() => read.promise, accept);

    Object.assign(identity, {
      ownerUserId: 'user-b',
      tenantId: 'tenant-2',
      editorGeneration: 2,
      fingerprint: 'fp-2',
    });
    read.resolve('stale');
    await expect(run).resolves.toBe(false);
    expect(accept).not.toHaveBeenCalled();
  });

  it('permits a current read after invalidate drops a hung receipt', async () => {
    const { busy, controller } = setup();
    const hung = deferred<string>();
    const acceptHung = accepting();
    const old = controller.run(() => hung.promise, acceptHung);

    controller.invalidate();
    expect(controller.isBusy()).toBe(false);
    expect(busy).toEqual([true, false]);
    await expect(controller.run(async () => 'fresh', accepting())).resolves.toBe(true);
    expect(busy).toEqual([true, false, true, false]);

    hung.resolve('late');
    await expect(old).resolves.toBe(false);
    expect(acceptHung).not.toHaveBeenCalled();
  });

  it('does not notify a new owner when invalidate runs after an ownership change', () => {
    const { busy, controller, identity } = setup();
    void controller.run(() => deferred<string>().promise, accepting());

    identity.ownerUserId = 'user-b';
    controller.invalidate();
    expect(busy).toEqual([true]);
    expect(controller.isBusy()).toBe(false);
  });

  it('survives throwing observers and fails closed when identity cannot be read', async () => {
    const onBusy = vi.fn(() => {
      throw new Error('observer');
    });
    const controller = createDraftReadController({ current: () => identityA, onBusy });
    const failedAccept = () => {
      throw new Error('accept');
    };
    await expect(controller.run(async () => 'x', failedAccept)).resolves.toBe(false);
    expect(controller.isBusy()).toBe(false);
    await expect(
      controller.run(
        async () => 'y',
        () => true
      )
    ).resolves.toBe(true);

    let unreadable = false;
    const failing = createDraftReadController({
      current: () => {
        if (unreadable) throw new Error('auth');
        return identityA;
      },
      onBusy: () => undefined,
    });
    const accept = accepting();
    const run = failing.run(async () => 'z', accept);
    unreadable = true;
    await expect(run).resolves.toBe(false);
    expect(accept).not.toHaveBeenCalled();
  });
});
