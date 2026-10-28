import ts from 'typescript';
import { replace, mutateNode } from './db-access-m4-four-controller-test.fixture.mjs';
export const INGRESS_CASES = [
  [
    'protocol extra authority field',
    s =>
      replace(
        s,
        "'operationId', 'claimId', 'staffId'",
        "'operationId', 'claimId', 'staffId', 'actorId'"
      ),
    'protocolSource',
  ],
  [
    'protocol unbounded serialized request',
    s => replace(s, 'length > 8192', 'length > 999999'),
    'protocolSource',
  ],
  [
    'protocol unknown request fields allowed',
    s => replace(s, 'Object.keys(row).some(key => !FIELDS.has(key))', 'false'),
    'protocolSource',
  ],
  [
    'protocol caller object accepted',
    s => replace(s, "typeof serialized !== 'string'", "typeof serialized === 'string'"),
    'protocolSource',
  ],
  [
    'protocol version broadening',
    s => replace(s, 'row.version !== 1', 'row.version < 1'),
    'protocolSource',
  ],
  [
    'protocol operation UUID unchecked',
    s => replace(s, '!UUID.test(row.operationId)', 'false'),
    'protocolSource',
  ],
  [
    'protocol unbounded resource identifier',
    s => replace(s, 'value.length <= 256', 'value.length <= 99999'),
    'protocolSource',
  ],
  [
    'protocol projected request replaced by caller object',
    s => replace(s, 'return Object.freeze({', 'return Object.freeze({ ...row,'),
    'protocolSource',
  ],
  [
    'new global shadow changes fingerprint semantics',
    s =>
      replace(
        s,
        'const { database, verifySession } = configuration;',
        'const { database, verifySession } = configuration; const JSON = configuration;'
      ),
  ],
  [
    'SQL quoted identifier changed',
    s => replace(s, "'app.current_tenant_id'", "'app. current_tenant_id'"),
  ],
  [
    'default parameter executes outside admission',
    s =>
      mutateNode(
        s,
        (n, a) => ts.isFunctionExpression(n) && n.name?.text === 'execute',
        (n, a) =>
          n
            .getText(a)
            .replace('cookie: unknown', 'cookie: unknown = configuration.database.execute()')
      ),
  ],
  [
    'transaction callback is no longer async',
    s => replace(s, 'database.transaction(async tx =>', 'database.transaction(tx =>'),
  ],
];
