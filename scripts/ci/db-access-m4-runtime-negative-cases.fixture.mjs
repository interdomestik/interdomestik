export const bootstrapCases = [
  [
    'admin fallback',
    'data = postgres(dataTarget.url, {',
    'data = postgres(process.env.DATABASE_URL || dataTarget.url, {',
  ],
  [
    'crossed identity pool',
    'database: drizzle(identity, { schema })',
    'database: drizzle(data, { schema })',
  ],
  [
    'crossed business pool',
    'const database = drizzle(data, { schema });',
    'const database = drizzle(identity, { schema });',
  ],
  [
    'A1 caller-selected bypass',
    'Object.freeze({ database, verifySession })',
    'Object.freeze({ database, verifySession: async () => cookie })',
  ],
  [
    'cached prior principal',
    'const verifySession = createCurrentStoreSessionVerifier({',
    'const verifySession = cache(createCurrentStoreSessionVerifier({',
  ],
  [
    'notification owner crossing',
    'databaseURL: notificationTarget.url',
    'databaseURL: dataTarget.url',
  ],
  [
    'wrong notifier binding',
    'createM4AssignmentPostcommitNotifier(notificationOwner.open)',
    'createM4AssignmentPostcommitNotifier(configuration.open)',
  ],
  [
    'deadline never scheduled',
    'const timer = setTimeout(operation.stop, captured.operationDeadlineMs);',
    'const timer = setTimeout(() => undefined, captured.operationDeadlineMs);',
  ],
  ['retirement does not mark stopped', 'stopped = true;', 'stopped = false;'],
  ['retirement drops owned work wait', 'await work;', 'void work;'],
  [
    'early slot release',
    'active.add(operation);',
    'active.add(operation); active.delete(operation);',
  ],
  [
    'termination failure ignored',
    'return stopped || !ended ? uncertain : result;',
    'return stopped ? uncertain : result;',
  ],
  [
    'work automatically retried',
    'await work;',
    'await work; await executeProfile(profile, cookie, serialized, observation);',
  ],
  [
    'posture call not awaited',
    'await Promise.all([\n          assertM4PoolPosture',
    'void Promise.all([\n          assertM4PoolPosture',
  ],
  [
    'posture bound to wrong role',
    'assertM4PoolPosture(data, dataTarget)',
    'assertM4PoolPosture(data, identityTarget)',
  ],
  [
    'production TLS disabled',
    'return construct(configuration, false);',
    'return construct(configuration, true);',
  ],
  [
    'expanded production TLS disabled',
    'return construct(configuration, false, configuration)',
    'return construct(configuration, true, configuration)',
  ],
  [
    'outward secret capability',
    'ownRuntime(Object.freeze({ execute, close }))',
    'ownRuntime(Object.freeze({ execute, close, issuerSecret }))',
  ],
  [
    'outward pool opener',
    'ownRuntime(Object.freeze({ execute, close }))',
    'ownRuntime(Object.freeze({ execute, close, postgres }))',
  ],
  [
    'consumer profile chooses staff',
    "executeProfile('ops', cookie, serialized)",
    'executeProfile(cookie as Profile, cookie, serialized)',
  ],
  [
    'runtime export escapes type boundary',
    "export type * from './m4-private-runtime-types';",
    "export * from './m4-private-runtime-types';",
  ],
  [
    'type export points to alternate module',
    "export type * from './m4-private-runtime-types';",
    "export type * from './other-runtime';",
  ],
];
export const retirementCases = [
  [
    'close without drain',
    '...pending.map(operation => operation.done)',
    '...pending.map(() => undefined)',
  ],
  ['close skips notification owner', 'notificationOwner?.close()', 'undefined'],
  [
    'optional notifier close made unconditional',
    'notificationOwner?.close()',
    'notificationOwner.close()',
  ],
];
export const contextCases = [
  [
    'ambient secret fallback',
    'issuerSecret,\n    operationDeadlineMs,',
    'issuerSecret: issuerSecret || process.env.BETTER_AUTH_SECRET,\n    operationDeadlineMs,',
  ],
  [
    'same purpose logins admitted',
    'identityTarget.login === dataTarget.login',
    'identityTarget.login !== dataTarget.login',
  ],
  ['endpoint mismatch admitted', 'identityTarget.serverKey !== dataTarget.serverKey', 'false'],
  ['crossed notification purpose', 'notificationTarget.login === dataTarget.login', 'false'],
  ['noninteger deadline accepted', '!Number.isSafeInteger(operationDeadlineMs)', 'false'],
];
export const postureCases = [
  ['credential URL query accepted', 'url.search ||', 'false ||'],
  ['credential URL fragment accepted', 'url.hash ||', 'false ||'],
  ['password not required', '!password ||', 'false ||'],
  [
    'control character credentials admitted',
    '/[\\u0000-\\u001f\\u007f]/u.test(login + password + database)',
    'false',
  ],
  [
    'remote endpoint allowed in local constructor',
    "(loopbackQualification && host !== '127.0.0.1' && host !== 'localhost')",
    'false',
  ],
  ['environment port fallback enabled', "url.port ||= '5432';", 'void url.port;'],
  [
    'credential URL leaked',
    "throw new Error('Invalid private M4 database configuration');",
    'throw new Error(String(value));',
  ],
  ['debug fallback removed', "    'DEBUG',\n", ''],
  [
    'environment guard inverted',
    'Boolean(process.env[`PG${option}`])',
    '!Boolean(process.env[`PG${option}`])',
  ],
  ['posture privilege creation allowed', 'and not checked.rolcreatedb', 'and checked.rolcreatedb'],
  ['posture superuser allowed', 'and not checked.rolsuper', 'and checked.rolsuper'],
  ['posture RLS bypass allowed', 'and not checked.rolbypassrls', 'and checked.rolbypassrls'],
  ['posture inherited role allowed', 'and not checked.rolinherit', 'and checked.rolinherit'],
  ['login bound to wrong value', '${target.login}', '${target.database}'],
  [
    'server database identity skipped',
    'and CAST(pg_catalog.current_database() AS pg_catalog.text) OPERATOR(pg_catalog.=) CAST(${target.database} AS pg_catalog.text)',
    'and true',
  ],
  [
    'role membership predicate defeated',
    'where membership.member OPERATOR(pg_catalog.=) checked.oid',
    'where false',
  ],
  [
    'owner predicate defeated',
    'where relation.relowner OPERATOR(pg_catalog.=) checked.oid',
    'where false',
  ],
  ['definer predicate defeated', 'where routine.prosecdef', 'where false'],
  ['role gate bypassed in SQL', 'then 1 else 0 end as gate', 'then 1 else 1 end as gate'],
  [
    'returned gate validation removed',
    "if (rows.length !== 1 || rows[0]?.gate !== 1) throw new Error('Private M4 pool posture denied');",
    'void rows;',
  ],
  ['optional gate access changed', 'rows[0]?.gate', 'rows[0].gate'],
  [
    'tag raw spelling substituted',
    'select 1 OPERATOR(pg_catalog./)',
    'select 1 OPERATOR(\\x70g_catalog./)',
  ],
];
export const typeCases = [
  [
    'runtimeTypes',
    'runtime type module effect',
    '',
    '\nexport const leaked = process.env.DATABASE_URL;',
  ],
  ['controllerTypes', 'controller type module effect', '', '\nvoid process.env.DATABASE_URL;'],
  [
    'runtimeTypes',
    'erased import becomes runtime',
    'import type { M4OpsResponse }',
    'import { M4OpsResponse }',
  ],
  [
    'controllerTypes',
    'controller import becomes runtime',
    'import type * as schema',
    'import * as schema',
  ],
  [
    'runtimeTypes',
    'method signature broadened',
    'execute(cookie: unknown, serialized: unknown)',
    'execute(cookie: unknown, serialized: unknown, principal: unknown)',
  ],
];
