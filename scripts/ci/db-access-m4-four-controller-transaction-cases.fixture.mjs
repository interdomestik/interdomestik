import assert from 'node:assert/strict';
import ts from 'typescript';
import {
  replace,
  mutateNode,
  nodes,
  callNamed,
  transactionStatement,
  fingerprintElement,
  insertStatement,
} from './db-access-m4-four-controller-test.fixture.mjs';
export const TRANSACTION_CASES = [
  [
    'session gate missing',
    s =>
      transactionStatement(
        s,
        (text, n) => ts.isIfStatement(n) && text.startsWith('if (!principal)'),
        ''
      ),
  ],
  [
    'session verifier replaced',
    s => replace(s, 'await verifySession(cookie)', 'cookie as CurrentOperationPrincipal'),
  ],
  ['session not awaited', s => replace(s, 'await verifySession(cookie)', 'verifySession(cookie)')],
  [
    'role gate widened',
    s =>
      replace(
        s,
        'isTenantAdmin(actor.role) || isSuperAdmin(actor.role)',
        "isTenantAdmin(actor.role) || isSuperAdmin(actor.role) || actor.role === 'staff'"
      ),
  ],
  [
    'current role replaced by admitted old role',
    s => replace(s, 'isTenantAdmin(actor.role)', 'isTenantAdmin(principal.actorRole)'),
  ],
  ['role lock weakened', s => replace(s, ".for('share')", ".for('key share')")],
  ['role lock omitted', s => replace(s, ".for('share')", '')],
  [
    'actor home tenant changed',
    s =>
      replace(
        s,
        'eq(schema.user.tenantId, principal.tenantId)',
        'eq(schema.user.tenantId, principal.accessTenantId)'
      ),
  ],
  [
    'actor identifier changed',
    s => replace(s, 'eq(schema.user.id, principal.actorId)', 'eq(schema.user.id, request.staffId)'),
  ],
  [
    'claim resource gate missing',
    s =>
      transactionStatement(
        s,
        (text, n) => ts.isIfStatement(n) && text.startsWith('if (!claim)'),
        ''
      ),
  ],
  ['claim lock weakened', s => replace(s, ".for('update')", ".for('share')")],
  [
    'claim tenant replaced',
    s =>
      replace(
        s,
        'eq(schema.claims.tenantId, principal.accessTenantId)',
        'eq(schema.claims.tenantId, principal.tenantId)'
      ),
  ],
  [
    'tenant GUC persisted',
    s => replace(s, '${principal.tenantId}, true)', '${principal.tenantId}, false)'),
  ],
  ['effective role posture omitted', s => replace(s, ' and session_user=current_user', '')],
  ['RLS disabled', s => replace(s, 'set local row_security = on', 'set local row_security = off')],
  ['fingerprint omits current actor', s => fingerprintElement(s, 2, 'null')],
  ['fingerprint wrong target', s => fingerprintElement(s, 5, 'request.claimId')],
  ['replay conflict ignores actor', s => replace(s, 'previous.actorId !== actor.id ||', '')],
  [
    'replay conflict ignores version',
    s => replace(s, 'previous.version !== request.version ||', ''),
  ],
  [
    'replay payload unvalidated',
    s =>
      replace(
        s,
        'storedOpsResult(previous.response, request.claimId, staffId as string)',
        'previous.response as OpsResult'
      ),
  ],
  [
    'kernel wrong actor',
    s =>
      mutateNode(
        s,
        n => callNamed(n, 'assignClaimOwnerInTransaction'),
        (n, a) => n.getText(a).replace('actorId: actor.id', 'actorId: principal.actorId')
      ),
  ],
  [
    'kernel invocation not awaited',
    s =>
      mutateNode(
        s,
        n => ts.isAwaitExpression(n) && callNamed(n.expression, 'assignClaimOwnerInTransaction'),
        (n, a) => n.expression.getText(a)
      ),
  ],
  [
    'unexpected SQL swallowed',
    s => replace(s, 'if (!(error instanceof OpsDomainDenialError)) throw error;', ''),
  ],
  [
    'result insert unawaited',
    s => transactionStatement(s, insertStatement, (n, a) => n.getText(a).replace(/^await /, '')),
  ],
  [
    'denial result no longer binds identity',
    s => transactionStatement(s, insertStatement, (n, a) => 'if (result.success) ' + n.getText(a)),
  ],
  [
    'ledger receiver substituted',
    s =>
      transactionStatement(s, insertStatement, (n, a) =>
        n.getText(a).replace(/^await tx/, 'await database')
      ),
  ],
  [
    'outer failure falsely completed',
    s =>
      replace(
        s,
        "return { status: 'indeterminate', operationId: request.operationId };",
        "return { status: 'completed', operationId: request.operationId, replayed: false, result: {success:true} };"
      ),
  ],
  [
    'extra database path',
    s =>
      replace(
        s,
        'const principal = await verifySession(cookie);',
        'const principal = await verifySession(cookie); await tx.execute(sql`select 1`);'
      ),
  ],
  [
    'extra bootstrap execution',
    s =>
      replace(
        s,
        'const { database, verifySession } = configuration;',
        'const { database, verifySession } = configuration; database.execute();'
      ),
  ],
  [
    'ambient import',
    s =>
      replace(
        s,
        "import * as schema from '@interdomestik/database/schema';",
        "import * as schema from '@interdomestik/database';"
      ),
  ],
  [
    'new import initializer',
    s =>
      replace(
        s,
        "import { createHash } from 'node:crypto';",
        "import { createHash } from 'node:crypto'; import 'evil';"
      ),
  ],
  [
    'returned success wrong resource',
    s => replace(s, 'data.id !== claimId', 'data.id === claimId'),
    'wireSource',
  ],
  [
    'stored denial unbounded',
    s => replace(s, 'row.error.length <= 512', 'row.error.length <= 65536'),
    'wireSource',
  ],
  ['ledger completely removed', s => transactionStatement(s, insertStatement, '')],
  [
    'replay before authorization',
    s => {
      const { ast, result } = nodes(
        s,
        (n, a) => ts.isVariableStatement(n) && n.getText(a).startsWith('const [previous]')
      );
      assert.equal(result.length, 1);
      const block = result[0].parent;
      const index = block.statements.indexOf(result[0]);
      const end = block.statements[index + 1];
      assert.ok(ts.isIfStatement(end));
      const from = result[0].getStart(ast),
        to = end.getEnd(),
        text = s.slice(from, to);
      const remaining = s.slice(0, from) + s.slice(to);
      return replace(remaining, 'const principal =', text + '\nconst principal =');
    },
  ],
  [
    'ledger SQL failure swallowed',
    s =>
      transactionStatement(s, insertStatement, (n, a) => 'try { ' + n.getText(a) + ' } catch {}'),
  ],
  [
    'automatic retry',
    s =>
      replace(
        s,
        "return { status: 'indeterminate', operationId: request.operationId };",
        'return execute(cookie, serialized, serializedObservation);'
      ),
  ],
];
