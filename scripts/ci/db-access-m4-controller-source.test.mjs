import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import ts from 'typescript';
import {
  deriveM4OpsController,
  M4_CONTROLLER_FILE,
  M4_PROTOCOL_FILE,
} from './db-access-m4-controller-source.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const source = fs.readFileSync(path.join(root, M4_CONTROLLER_FILE), 'utf8');
const protocol = fs.readFileSync(path.join(root, M4_PROTOCOL_FILE), 'utf8');
const derive = (controllerSource = source, protocolSource = protocol) =>
  deriveM4OpsController({ controllerSource, protocolSource });
const hash = text => createHash('sha256').update(text).digest('hex');
const baseline = derive();
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length, 2, 'unique mutation anchor');
  return text.replace(before, after);
};
const negative = (label, mutate, isProtocol = false) =>
  test(label + ' rejects with fresh source bytes', () => {
    const original = isProtocol ? protocol : source,
      changed = mutate(original);
    assert.notEqual(hash(changed), hash(original));
    const ast = ts.createSourceFile(
      'mutant.ts',
      changed,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.TS
    );
    assert.equal(ast.parseDiagnostics.length, 0, 'semantic negative remains syntactically valid');
    assert.throws(
      () => (isProtocol ? derive(source, changed) : derive(changed)),
      /m4 controller source rejected/u
    );
  });

test('actual source derives complete ordered control trees, preserving explicit unresolved premises', () => {
  assert.equal(baseline.sourceSha256[M4_CONTROLLER_FILE], hash(source));
  assert.equal(baseline.sourceSha256[M4_PROTOCOL_FILE], hash(protocol));
  assert.equal(baseline.controllerPremiseOnly, true);
  assert.equal(baseline.runtimeAdmission, false);
  assert.equal(Object.keys(baseline.facts.controller.functions).length, 3);
  assert.equal(Object.keys(baseline.facts.protocol.functions).length, 2);
  assert.ok(baseline.sourceNodes.length > 30);
  assert.equal(baseline.facts.clauses.length, 19);
  assert.equal(baseline.facts.clauses[17].step, 'insert-every-completed-result');
  assert.ok(baseline.facts.clauses.every(clause => Array.isArray(clause.tree)));
  assert.ok(baseline.premises.some(x => x.includes('bootstrap')));
  assert.ok(baseline.premises.some(x => x.includes('all') || x.includes('All')));
  assert.ok(Object.isFrozen(baseline.facts.controller.functions.createM4OpsAssignmentController));
  assert.throws(() => {
    baseline.runtimeAdmission = true;
  }, TypeError);
});
test('comments, layout and local references preserve the finite semantic derivation', () => {
  const changed =
    '// source-bound comment\n' +
    source
      .replace(/\bprincipal\b/gu, 'admittedPrincipal')
      .replace(/\bprevious\b/gu, 'storedOperation');
  const result = derive(changed);
  assert.notEqual(
    result.sourceSha256[M4_CONTROLLER_FILE],
    baseline.sourceSha256[M4_CONTROLLER_FILE]
  );
  assert.equal(result.factsSha256, baseline.factsSha256);
});
test('aliased imports retain actual target identity', () => {
  const changed = source
    .replace('{ and, eq, sql }', '{ and, eq as equal, sql }')
    .replace(/\beq\(/gu, 'equal(');
  assert.equal(derive(changed).factsSha256, baseline.factsSha256);
});
const mutations = [
  [
    'session gate missing',
    "if (!principal) return { status: 'denied', reason: 'UNAUTHORIZED' };",
    '',
  ],
  [
    'session verifier replaced',
    'await verifySession(cookie)',
    'cookie as CurrentOperationPrincipal',
  ],
  ['session not awaited', 'await verifySession(cookie)', 'verifySession(cookie)'],
  [
    'role gate widened',
    'isTenantAdmin(actor.role) || isSuperAdmin(actor.role)',
    "isTenantAdmin(actor.role) || isSuperAdmin(actor.role) || actor.role === 'staff'",
  ],
  [
    'current role replaced by admitted old role',
    'isTenantAdmin(actor.role)',
    'isTenantAdmin(principal.actorRole)',
  ],
  ['role lock weakened', ".for('share')", ".for('key share')"],
  ['role lock omitted', ".for('share')", ''],
  [
    'actor home tenant changed',
    'eq(schema.user.tenantId, principal.tenantId)',
    'eq(schema.user.tenantId, principal.accessTenantId)',
  ],
  [
    'actor identifier changed',
    'eq(schema.user.id, principal.actorId)',
    'eq(schema.user.id, request.staffId)',
  ],
  [
    'claim resource gate missing',
    "if (!claim) return { status: 'denied', reason: 'RESOURCE_DENIED' };",
    '',
  ],
  ['claim lock weakened', ".for('update')", ".for('share')"],
  [
    'claim tenant replaced',
    'eq(schema.claims.tenantId, principal.accessTenantId)',
    'eq(schema.claims.tenantId, principal.tenantId)',
  ],
  ['tenant GUC persisted', '${principal.tenantId}, true)', '${principal.tenantId}, false)'],
  ['effective role posture omitted', ' and session_user=current_user', ''],
  ['RLS disabled', 'set local row_security = on', 'set local row_security = off'],
  ['fingerprint omits current actor', '              actor.id,\n', ''],
  [
    'fingerprint wrong target',
    '              request.claimId,\n              staffId,',
    '              request.claimId,\n              request.claimId,',
  ],
  ['replay conflict ignores actor', '            previous.actorId !== actor.id ||\n', ''],
  ['replay conflict ignores version', '            previous.version !== request.version ||\n', ''],
  [
    'replay payload unvalidated',
    'storedResult(previous.response, request.claimId, staffId)',
    'previous.response as AssignmentResult',
  ],
  [
    'kernel wrong actor',
    'assignClaimOwnerInTransaction(tx, {\n                  actorId: actor.id,',
    'assignClaimOwnerInTransaction(tx, {\n                  actorId: principal.actorId,',
  ],
  [
    'kernel invocation not awaited',
    ': await assignClaimOwnerInTransaction(tx,',
    ': assignClaimOwnerInTransaction(tx,',
  ],
  ['unexpected SQL swallowed', 'if (!(error instanceof OpsDomainDenialError)) throw error;', ''],
  [
    'result insert unawaited',
    'await tx.insert(schema.operationResults)',
    'tx.insert(schema.operationResults)',
  ],
  [
    'denial result no longer binds identity',
    'await tx.insert(schema.operationResults)',
    'if (result.success) await tx.insert(schema.operationResults)',
  ],
  [
    'ledger receiver substituted',
    'await tx.insert(schema.operationResults)',
    'await database.insert(schema.operationResults)',
  ],
  [
    'outer failure falsely completed',
    "return { status: 'indeterminate', operationId: request.operationId };",
    "return { status: 'completed', operationId: request.operationId, replayed: false, result: { success: true } };",
  ],
  [
    'extra database path',
    'const principal = await verifySession(cookie);',
    'const principal = await verifySession(cookie); await tx.execute(sql`select 1`);',
  ],
  [
    'extra bootstrap execution',
    'const { database, verifySession } = configuration;',
    'const { database, verifySession } = configuration; database.execute();',
  ],
  [
    'ambient import',
    "import * as schema from '@interdomestik/database/schema';",
    "import * as schema from '@interdomestik/database';",
  ],
  [
    'new import initializer',
    "import { createHash } from 'node:crypto';",
    "import { createHash } from 'node:crypto'; import 'evil';",
  ],
  ['returned success wrong resource', 'data.id !== claimId', 'data.id === claimId'],
  ['stored denial unbounded', 'row.error.length <= 512', 'row.error.length <= 65536'],
];
for (const [label, before, after] of mutations)
  negative(label, text => replaceOnce(text, before, after));
negative('ledger completely removed', text =>
  text.replace(
    /        await tx\.insert\(schema\.operationResults\)\.values\(\{[\s\S]*?\n        \}\);/u,
    ''
  )
);
negative('replay before authorization', text => {
  const start = text.indexOf('        const [previous] ='),
    end = text.indexOf('        let result:', start);
  const block = text.slice(start, end);
  assert(start > 0 && end > start);
  return (
    text.slice(0, start).replace('        const principal =', block + '        const principal =') +
    text.slice(end)
  );
});
negative('ledger SQL failure swallowed', text => {
  const start = text.indexOf('        await tx.insert(schema.operationResults)'),
    end = text.indexOf('\n        return { status:', start);
  assert(start > 0 && end > start);
  return (
    text.slice(0, start) + 'try {\n' + text.slice(start, end) + '\n} catch {}' + text.slice(end)
  );
});
negative('automatic retry', text =>
  replaceOnce(
    text,
    "return { status: 'indeterminate', operationId: request.operationId };",
    'return execute(cookie, serialized);'
  )
);
for (const [label, before, after] of [
  [
    'extra authority field',
    "'operationId', 'claimId', 'staffId'",
    "'operationId', 'claimId', 'staffId', 'actorId'",
  ],
  ['unbounded serialized request', 'length > 8192', 'length > 999999'],
  ['unknown request fields allowed', 'Object.keys(row).some(key => !FIELDS.has(key))', 'false'],
  ['caller object accepted', "typeof serialized !== 'string'", "typeof serialized === 'string'"],
  ['version broadening', 'row.version !== 1', 'row.version < 1'],
  ['operation UUID unchecked', '!UUID.test(row.operationId)', 'false'],
  ['unbounded resource identifier', 'value.length <= 256', 'value.length <= 99999'],
  [
    'projected request replaced by caller object',
    'return Object.freeze({',
    'return Object.freeze({ ...row,',
  ],
])
  negative('protocol ' + label, text => replaceOnce(text, before, after), true);

negative('new global shadow changes fingerprint semantics', text =>
  replaceOnce(
    text,
    'const { database, verifySession } = configuration;',
    'const { database, verifySession } = configuration; const JSON = configuration;'
  )
);
negative('SQL quoted identifier changed', text =>
  replaceOnce(text, "'app.current_tenant_id'", "'app. current_tenant_id'")
);
negative('default parameter executes outside admission', text =>
  replaceOnce(
    text,
    'cookie: unknown, serialized: unknown',
    'cookie: unknown = configuration.database.execute(), serialized: unknown'
  )
);
negative('transaction callback is no longer async', text =>
  replaceOnce(text, 'database.transaction(async tx =>', 'database.transaction(tx =>')
);
