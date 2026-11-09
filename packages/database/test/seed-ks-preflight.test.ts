import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import type { SeedConfig } from '../src/seed-types';

test('direct KS invocation refuses production before resolving any database module', async () => {
  let databaseResolved = false;
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (/\/db(?:\.ts)?$/.test(specifier)) {
        databaseResolved = true;
        throw new Error('Database import must not happen');
      }
      return nextResolve(specifier, context);
    },
  });
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  try {
    const { seedKsWorkflowPack } = await import('../src/seed-packs/ks-workflow-pack');
    await assert.rejects(seedKsWorkflowPack({} as SeedConfig), /Seed target refused: production$/);
    assert.equal(databaseResolved, false);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    hooks.deregister();
  }
});
