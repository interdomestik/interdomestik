import assert from 'node:assert/strict';
import { test } from 'node:test';
import { priorFixture } from './db-access-m4-prior-preparation-fixture.mjs';
import { outputShape } from './db-access-output-binding.mjs';

test('unit worker double: result AND clean exit precede binding, with one-use consumption', async () => {
  const f = await priorFixture();
  try {
    const item = f.start(),
      prepared = f.prepared();
    let ready = false;
    const waiting = f.api.waitM4PriorPreparation(item.handle).then(() => {
      ready = true;
    });
    item.worker.emit('message', item.message());
    await Promise.resolve();
    assert.equal(ready, false);
    assert.throws(
      () => f.api.bindM4PriorPreparation(item.handle, prepared, f.event),
      /not awaited/u
    );
    item.worker.emit('exit', 0);
    await waiting;
    assert.equal(ready, true);
    assert.deepEqual(item.worker.options.env, {});
    assert.deepEqual(item.worker.options.execArgv, []);
    assert.equal(item.worker.options.resourceLimits.maxOldGenerationSizeMb, 3072);
    assert.ok(String(item.worker.url).endsWith('/db-access-m4-prior-worker.mjs'));
    f.api.bindM4PriorPreparation(item.handle, prepared, f.event);
    assert.deepEqual(f.api.priorControlsFor(prepared), f.controls);
    assert.throws(() => f.api.priorControlsFor(prepared), /already consumed/u);
    assert.throws(
      () => f.api.bindM4PriorPreparation(item.handle, f.prepared(), f.event),
      /duplicate bind/u
    );
    assert.equal(f.state.serialCalls, 0, 'no silent serial fallback after owned consumption');
    await f.api.closeM4PriorPreparation(item.handle);
  } finally {
    await f.cleanup();
  }
});

test('unit worker double: clone, JSON, projected result and foreign handles cannot act as authority', async () => {
  const f = await priorFixture();
  try {
    const item = f.start();
    for (const foreign of [
      structuredClone(item.handle),
      JSON.parse(JSON.stringify(item.handle)),
      item.message(),
      {},
    ]) {
      assert.throws(() => f.api.waitM4PriorPreparation(foreign), /foreign or serialized/u);
      assert.throws(
        () => f.api.bindM4PriorPreparation(foreign, f.prepared(), f.event),
        /foreign or serialized/u
      );
      await assert.rejects(f.api.closeM4PriorPreparation(foreign), /foreign or serialized/u);
    }
    await f.api.closeM4PriorPreparation(item.handle);
    await assert.rejects(f.api.waitM4PriorPreparation(item.handle), /closed before completion/u);
  } finally {
    await f.cleanup();
  }
});

for (const [name, change] of [
  [
    'foreign nonce',
    m => {
      m.nonce = 'foreign';
    },
  ],
  [
    'foreign source/event/policy',
    m => {
      m.binding = 'f'.repeat(64);
    },
  ],
  [
    'malformed historical digest',
    m => {
      m.snapshotDigest = 'not-a-digest';
    },
  ],
  [
    'changed controls',
    m => {
      m.controls.priorScoped.push('extra.ts');
    },
  ],
  [
    'duplicate unknown',
    m => {
      m.controls.analysisUnknown.push('first');
    },
  ],
  [
    'duplicate scope',
    m => {
      m.controls.priorScoped.push('a.ts');
    },
  ],
  [
    'missing field',
    m => {
      delete m.controls.priorScoped;
    },
  ],
  [
    'extra field',
    m => {
      m.extra = true;
    },
  ],
])
  test(`unit worker double: ${name} rejection cannot revive on exit0`, async () => {
    const f = await priorFixture();
    try {
      const item = f.start(),
        message = item.message();
      change(message);
      if (name.startsWith('duplicate'))
        message.controlsDigest = outputShape(message.controls).digest;
      item.worker.emit('message', message);
      item.worker.emit('exit', 0);
      await assert.rejects(f.api.waitM4PriorPreparation(item.handle), /foreign\/invalid/u);
      assert.throws(
        () => f.api.bindM4PriorPreparation(item.handle, f.prepared(), f.event),
        /not awaited/u
      );
      await f.api.closeM4PriorPreparation(item.handle);
    } finally {
      await f.cleanup();
    }
  });

for (const kind of ['missing', 'duplicate', 'nonzero', 'error', 'messageerror'])
  test(`unit worker double: ${kind} completion fails and joins cleanup`, async () => {
    const f = await priorFixture();
    try {
      const item = f.start();
      if (kind !== 'missing') item.worker.emit('message', item.message());
      if (kind === 'duplicate') item.worker.emit('message', item.message());
      if (['error', 'messageerror'].includes(kind))
        item.worker.emit(kind, Error('controlled worker error'));
      item.worker.emit('exit', kind === 'nonzero' ? 1 : 0);
      await assert.rejects(f.api.waitM4PriorPreparation(item.handle));
      assert.throws(
        () => f.api.bindM4PriorPreparation(item.handle, f.prepared(), f.event),
        /not awaited/u
      );
      await f.api.closeM4PriorPreparation(item.handle);
      await f.api.closeM4PriorPreparation(item.handle);
      assert.equal(item.worker.terminations, 1);
    } finally {
      await f.cleanup();
    }
  });

for (const kind of [
  'trusted-reference',
  'trusted-bytes',
  'model',
  'adoption',
  'source-event-policy',
])
  test(`unit worker double: ${kind} mutation spends a bound record`, async () => {
    const f = await priorFixture();
    try {
      const item = f.start();
      await f.finish(item);
      const prepared = f.prepared();
      f.api.bindM4PriorPreparation(item.handle, prepared, f.event);
      if (kind === 'trusted-reference') prepared.trusted = new Map(prepared.trusted);
      if (kind === 'trusted-bytes') prepared.trusted.set('a.ts', 'changed');
      if (kind === 'model') prepared.model = {};
      if (kind === 'adoption') prepared.adoption = { ...prepared.adoption };
      if (kind === 'source-event-policy') f.state.generation++;
      assert.throws(() => f.api.priorControlsFor(prepared), /changed prepared/u);
      assert.throws(() => f.api.priorControlsFor(prepared), /already consumed/u);
      assert.equal(f.state.serialCalls, 0);
      await f.api.closeM4PriorPreparation(item.handle);
    } finally {
      await f.cleanup();
    }
  });

test('unit worker double: closed preparations cannot bind or consume; standalone remains serial', async () => {
  const f = await priorFixture();
  try {
    const pending = f.start();
    await f.api.closeM4PriorPreparation(pending.handle);
    await assert.rejects(f.api.waitM4PriorPreparation(pending.handle), /closed before completion/u);
    const item = f.start();
    await f.finish(item);
    const prepared = f.prepared();
    f.api.bindM4PriorPreparation(item.handle, prepared, f.event);
    await f.api.closeM4PriorPreparation(item.handle);
    assert.throws(() => f.api.priorControlsFor(prepared), /changed prepared/u);
    assert.throws(
      () => f.api.bindM4PriorPreparation(item.handle, f.prepared(), f.event),
      /closed/u
    );
    assert.deepEqual(f.api.priorControlsFor(f.prepared()), f.controls);
    assert.deepEqual(f.api.priorControlsFor(f.prepared()), f.controls);
    assert.equal(f.state.serialCalls, 2);
  } finally {
    await f.cleanup();
  }
});

test('unit worker double: source/event changes before completion cannot produce a usable result', async () => {
  const f = await priorFixture();
  try {
    const item = f.start();
    item.worker.emit('message', item.message());
    f.state.generation++;
    item.worker.emit('exit', 0);
    await assert.rejects(f.api.waitM4PriorPreparation(item.handle), /changed before completion/u);
    assert.throws(
      () => f.api.bindM4PriorPreparation(item.handle, f.prepared(), f.event),
      /not awaited/u
    );
    await f.api.closeM4PriorPreparation(item.handle);
  } finally {
    await f.cleanup();
  }
});

test('unit worker double: foreign prepared authority, event and historical snapshot cannot bind', async () => {
  const f = await priorFixture();
  try {
    const item = f.start();
    await f.finish(item);
    assert.throws(
      () => f.api.bindM4PriorPreparation(item.handle, { ...f.prepared(), adoption: {} }, f.event),
      /foreign prepared/u
    );
    assert.throws(
      () =>
        f.api.bindM4PriorPreparation(item.handle, { ...f.prepared(), trusted: new Map() }, f.event),
      /snapshot mismatch/u
    );
    assert.throws(
      () =>
        f.api.bindM4PriorPreparation(item.handle, f.prepared(), {
          ...f.event,
          context: { id: 'foreign' },
        }),
      /source\/event/u
    );
    const prepared = f.prepared();
    f.api.bindM4PriorPreparation(item.handle, prepared, f.event);
    assert.deepEqual(f.api.priorControlsFor(prepared), f.controls);
    await f.api.closeM4PriorPreparation(item.handle);
  } finally {
    await f.cleanup();
  }
});
