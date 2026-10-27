import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import {
  deriveM4AssignmentControllers,
  deriveM4PrivateRuntimeSource,
  proof,
  runtimeSources,
  controllerSources,
  kernel,
  controller,
  family,
  privateRuntime,
} from './db-access-m4-assignment-context.fixture.mjs';

test('all four profile routes carry exact AST owner/parameter/factory locators', () => {
  assert.deepEqual(
    controller.contextFunctions[0].calls.filter(r => r.receiverForwarded).map(r => r.target.name),
    [
      'assignClaimOwnerInTransaction',
      'assignStaffInTransaction',
      'assignLegacyAdminInTransaction',
      'assignLegacyAgentInTransaction',
    ]
  );
  assert.equal(privateRuntime.assignmentContextSource.factories.length, 4);
  assert.equal(kernel.contextFunctions[2].parameters.length, 2);
});

test('previous fixed kernel/controller/family facts remain byte-equivalent', () => {
  assert.equal(
    kernel.factsSha256,
    'ffcde96e48323618c32c2ebb5ec640f52bafbb2d068eb14bfb9815de10f2e01d'
  );
  assert.equal(
    controller.factsSha256,
    '3b484a702c9cc3b38a11521f9a2279d038b5d85ac0c8e321d155d04fc2213db6'
  );
  assert.equal(
    family.factsSha256,
    '1eecd90490726c8a43453011d656e581e0dc1456b7f1ccfe4a453d6b7e4e4636'
  );
});

for (const [label, key, from, to] of [
  [
    'factory',
    'bootstrapSource',
    'createM4OpsAssignmentController(configuration)',
    'createM4StaffAssignmentController(configuration)',
  ],
  [
    'receiver invocation',
    'controllerSource',
    'assignClaimOwnerInTransaction(tx, {',
    'assignClaimOwnerInTransaction(database, {',
  ],
  [
    'data transaction',
    'controllerSource',
    'database.transaction(async tx => {',
    'identityDb.transaction(async tx => {',
  ],
  [
    'callback tx',
    'controllerSource',
    'assignStaffInTransaction(tx, input)',
    'assignStaffInTransaction(identityDb, input)',
  ],
  [
    'profile',
    'controllerSource',
    "createPrivateAssignmentController(configuration, 'staff')",
    "createPrivateAssignmentController(configuration, 'ops')",
  ],
  [
    'identity receiver',
    'bootstrapSource',
    'const database = drizzle(data, { schema });',
    'const database = drizzle(identity, { schema });',
  ],
  ['actor', 'controllerSource', 'actorId: actor.id,', 'actorId: principal.actorId,'],
  [
    'tenant',
    'controllerSource',
    'tenantId: principal.accessTenantId,',
    'tenantId: principal.tenantId,',
  ],
])
  test('independent fixed source derivation rejects wrong ' + label, () => {
    const input = key === 'bootstrapSource' ? runtimeSources : controllerSources;
    assert(input[key].includes(from));
    const value = { ...input, [key]: input[key].replace(from, to) };
    assert.throws(() =>
      key === 'bootstrapSource'
        ? deriveM4PrivateRuntimeSource(value)
        : deriveM4AssignmentControllers(value)
    );
  });

test('foreign event cannot consume copied construction data', () =>
  assert.throws(() =>
    proof.deriveAssignmentContextRefinements({
      runtime: { contextSha256: '0'.repeat(64) },
      event: { context: { foreign: true } },
    })
  ));

for (const malformed of [false, true, 'null-owner', 'shutdown-error'])
  test(
    'client retires restricted child before ' +
      (malformed === 'null-owner'
        ? 'refusing null owner'
        : malformed === 'shutdown-error'
          ? 'refusing rejected shutdown'
          : malformed
            ? 'refusing missing owner rows'
            : 'returning matched owner rows'),
    async () => {
      const { EventEmitter } = await import('node:events');
      let disconnected = false;
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      const completion = {
        closed: malformed === true ? 0 : 1,
        assignmentContexts:
          malformed === true ? [] : malformed === 'null-owner' ? [null] : [{ runtimeId: 1 }],
      };
      child.send = (message, callback) => {
        queueMicrotask(() =>
          child.emit('message', {
            id: message.id,
            ok: !(malformed === 'shutdown-error' && message.op === 'shutdown'),
            result:
              message.op === 'create'
                ? { frozen: true, methods: ['close', 'execute'] }
                : message.op === 'shutdown'
                  ? completion
                  : undefined,
          })
        );
        callback?.();
      };
      child.disconnect = () => {
        disconnected = true;
        queueMicrotask(() => child.emit('exit', 0, null));
      };
      child.kill = () => {
        throw Error('unit child kill was unnecessary');
      };
      const source = fs.readFileSync(
        new URL('./db-access-m4-runtime-client.mjs', import.meta.url),
        'utf8'
      );
      const compiled = ts.transpileModule(source, {
          compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        module = { exports: {} };
      new Function('require', 'module', 'exports', compiled)(
        name =>
          name === 'node:child_process'
            ? {
                fork: () => {
                  queueMicrotask(() =>
                    child.emit('message', { ready: true, administratorCredentialPresent: false })
                  );
                  return child;
                },
              }
            : { default: path },
        module,
        module.exports
      );
      const client = await module.exports.openM4RestrictedChild('/explicit/unit/root');
      const runtime = client.createOps({ explicitUnitOnly: true });
      await runtime.close();
      if (malformed) await assert.rejects(client.close(), /restricted child failed/);
      else assert.equal(await client.close(), completion);
      assert(disconnected);
    }
  );
