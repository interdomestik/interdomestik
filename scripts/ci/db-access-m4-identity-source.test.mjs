import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { SESSION_RESOLVER_CONTRACT } from './db-access-m4-identity-contract.mjs';
import { deriveM4IdentitySource, M4_IDENTITY_FILES } from './db-access-m4-identity-source.mjs';
const root = path.resolve(import.meta.dirname, '../..');
const read = key => fs.readFileSync(path.join(root, M4_IDENTITY_FILES[key]), 'utf8');
const input = {
  verifierSource: read('verifier'),
  userSchemaSource: read('userSchema'),
  sessionSource: read('session'),
  sharedAuthPackageSource: read('resolver'),
};
const hash = text => createHash('sha256').update(text).digest('hex');
const positive = deriveM4IdentitySource(input);
const replaceOnce = (text, before, after) => {
  assert.equal(text.split(before).length, 2, 'unique negative anchor');
  return text.replace(before, after);
};
function negative(label, key, before, after) {
  test(label + ' rejects freshly changed source', () => {
    const changed = replaceOnce(input[key], before, after);
    assert.notEqual(hash(changed), hash(input[key]));
    if (key === 'sharedAuthPackageSource') assert.doesNotThrow(() => JSON.parse(changed));
    else
      assert.equal(
        ts.createSourceFile('mutant.ts', changed, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS)
          .parseDiagnostics.length,
        0
      );
    assert.throws(
      () => deriveM4IdentitySource({ ...input, [key]: changed }),
      /m4 (?:identity|controller) source rejected/u
    );
  });
}
test('current A1/config/callee source derives a premise with seven current-store clauses', () => {
  assert.ok(Object.isFrozen(SESSION_RESOLVER_CONTRACT));
  for (const key of ['exports', 'scripts', 'devDependencies'])
    assert.ok(Object.isFrozen(SESSION_RESOLVER_CONTRACT[key]));
  assert.equal(positive.identityPremiseOnly, true);
  assert.equal(positive.runtimeAdmission, false);
  for (const [key, value] of Object.entries(M4_IDENTITY_FILES))
    assert.equal(positive.sourceSha256[value], hash(read(key)));
  assert.equal(positive.facts.verifier.clauses.length, 7);
  assert.equal(positive.facts.verifier.clauses[0].step, 'read-current-session');
  assert.equal(positive.facts.verifier.clauses.at(-1).step, 'return-frozen-principal');
  assert.equal(positive.facts.resolvedAccessTenantCallee.target, M4_IDENTITY_FILES.session);
  assert.deepEqual(positive.facts.session.accessTenantOrder, [
    'current.user.accessTenantId?.trim()',
    'current.user.tenantId?.trim()',
  ]);
  assert.ok(positive.premises.some(value => value.includes('expired-session DELETE')));
  assert.ok(positive.premises.some(value => value.includes('protected producer')));
  assert.ok(Object.isFrozen(positive.facts.verifier.clauses));
  assert.throws(() => {
    positive.runtimeAdmission = true;
  }, TypeError);
});
test('layout/comments and verifier local renames keep facts while source identity changes', () => {
  const changed =
    '// Same source contract with a distinct authenticated digest\n' +
    input.verifierSource
      .replace(/\bauthority\b/gu, 'privateIssuer')
      .replace(/\bcurrent\b/gu, 'currentPrincipal');
  const result = deriveM4IdentitySource({ ...input, verifierSource: changed });
  assert.equal(result.factsSha256, positive.factsSha256);
  assert.notEqual(
    result.sourceSha256[M4_IDENTITY_FILES.verifier],
    positive.sourceSha256[M4_IDENTITY_FILES.verifier]
  );
});
test('renamed imported verifier calls retain module and export binding', () => {
  const changed = input.verifierSource
    .replace('{ betterAuth }', '{ betterAuth as createAuthority }')
    .replace('betterAuth({', 'createAuthority({');
  assert.equal(
    deriveM4IdentitySource({ ...input, verifierSource: changed }).factsSha256,
    positive.factsSha256
  );
});
for (const [label, before, after] of [
  ['cookie cache enabled', 'cookieCache: { enabled: false }', 'cookieCache: { enabled: true }'],
  ['getSession cache enabled', 'disableCookieCache: true', 'disableCookieCache: false'],
  ['refresh enabled', 'disableRefresh: true', 'disableRefresh: false'],
  ['query controls removed', 'query: { disableCookieCache: true, disableRefresh: true },', ''],
  ['logger exposes SQL errors', 'logger: { disabled: true }', 'logger: { disabled: false }'],
  [
    'caller headers merged',
    'new Headers({ cookie })',
    'new Headers({ ...configuration.headers, cookie })',
  ],
  ['caller headers substituted', 'new Headers({ cookie })', 'cookie as Headers'],
  [
    'caller tenant header added',
    'new Headers({ cookie })',
    "new Headers({ cookie, 'x-tenant-id': configuration.tenantId })",
  ],
  [
    'admission supplied caller DTO',
    'const actor = current.user;',
    'const actor = configuration.user;',
  ],
  ['actor id taken from caller', 'actorId: actor.id,', 'actorId: configuration.actorId,'],
  ['role taken from caller', 'actorRole: actor.role,', 'actorRole: configuration.actorRole,'],
  [
    'access tenant taken from caller',
    'ensureAccessTenantId(current)',
    'configuration.accessTenantId',
  ],
  ['session user identity no longer binds actor', 'current.session.userId !== actor.id', 'false'],
  [
    'branch identifier unchecked',
    '(actor.branchId != null && !identifier(actor.branchId))',
    'false',
  ],
  ['user identifier unchecked', '!identifier(actor.id) ||', ''],
  ['role identifier unchecked', '!identifier(actor.role) ||', ''],
  ['home tenant identifier unchecked', '!identifier(tenantId) ||', ''],
  ['access tenant identifier unchecked', '!identifier(accessTenantId) ||', ''],
  ['session identifier unchecked', '!identifier(current.session.id) ||', ''],
  [
    'session absence defaulted',
    'if (!current) return null;',
    'if (!current) return configuration.defaultPrincipal;',
  ],
  ['unbounded cookie', 'cookie.length > 8192', 'cookie.length > 999999'],
  ['empty cookie admitted', 'cookie.length === 0 ||', ''],
  ['caller object accepted', "typeof cookie !== 'string'", "typeof cookie === 'string'"],
  ['cookie controls allowed', '/[\\r\\n\\u0000]/.test(cookie)', 'false'],
  ['unbounded identity', 'value.length <= 256', 'value.length <= 999999'],
  ['identity trimming skipped', 'value.trim() === value &&', ''],
  [
    'issuer prefix uses listener',
    'baseURL: configuration.issuerBaseURL,',
    "baseURL: 'http://private-backend',",
  ],
  [
    'issuer secret substituted',
    'secret: configuration.issuerSecret,',
    "secret: 'attacker-selected-secret-string-32',",
  ],
  [
    'issuer secret minimum weakened',
    'configuration.issuerSecret.length < 32',
    'configuration.issuerSecret.length < 1',
  ],
  ['issuer userinfo permitted', 'issuer.username ||', ''],
  ['issuer URL query permitted', 'issuer.search ||', ''],
  [
    'unqualified identity DB substituted',
    'drizzleAdapter(configuration.database,',
    'drizzleAdapter(configuration.adminDatabase,',
  ],
  [
    'extra protected provider schema',
    'schema: { user: schema.user, session: schema.session }',
    'schema: { user: schema.user, session: schema.session, account: schema.account }',
  ],
  [
    'provider arbitrary defaults merged',
    'const authority = betterAuth({',
    'const authority = betterAuth({ ...configuration.providerOptions,',
  ],
  [
    'API returned instead of projected principal',
    'return Object.freeze({',
    'return authority.api; return Object.freeze({',
  ],
  [
    'handler returned instead of projection',
    'return Object.freeze({',
    'return authority.handler; return Object.freeze({',
  ],
  ['unfrozen principal', 'return Object.freeze({', 'return ({'],
  ['session read not awaited', 'await authority.api.getSession({', 'authority.api.getSession({'],
  ['different provider endpoint', 'authority.api.getSession({', 'authority.api.listSessions({'],
  [
    'default cached session fallback',
    'const current = await authority.api.getSession({',
    'const current = configuration.cachedPrincipal ?? await authority.api.getSession({',
  ],
  [
    'extra effect before session read',
    'const current = await authority.api.getSession({',
    'configuration.database.execute(); const current = await authority.api.getSession({',
  ],
  [
    'extra module loader',
    "import { betterAuth } from 'better-auth';",
    "import { betterAuth } from 'better-auth'; import 'unsealed-initializer';",
  ],
  [
    'different access tenant callee',
    "from '@interdomestik/shared-auth/session'",
    "from '@interdomestik/shared-auth'",
  ],
  [
    'globals shadowed',
    'const issuer = new URL(configuration.issuerBaseURL);',
    'const URL = configuration.URL; const issuer = new URL(configuration.issuerBaseURL);',
  ],
  [
    'default cookie executes caller effect',
    'function verify(cookie: unknown)',
    'function verify(cookie: unknown = configuration.database.execute())',
  ],
])
  negative(label, 'verifierSource', before, after);
negative(
  'unavailable store fallback',
  'verifierSource',
  '// Store failures and expired-session cleanup failures both deny admission.\n      return null;',
  'return configuration.previousPrincipal;'
);
for (const [label, before, after] of [
  [
    'protected tenant input accepted',
    "fieldName: 'tenantId',\n      input: false",
    "fieldName: 'tenantId',\n      input: true",
  ],
  ['role default escalated', "defaultValue: 'member'", "defaultValue: 'admin'"],
  [
    'role caller input accepted',
    "defaultValue: 'member',\n      input: false",
    "defaultValue: 'member',\n      input: true",
  ],
  [
    'new authority field',
    'additionalFields: {',
    "additionalFields: { accessTenantId: {type: 'string', input:true},",
  ],
  [
    'user schema initializer effect',
    'export const userSchemaConfig = {',
    'configuration.execute(); export const userSchemaConfig = {',
  ],
  ['runtime provider import', 'import type { BetterAuthOptions }', 'import { BetterAuthOptions }'],
])
  negative(label, 'userSchemaSource', before, after);
for (const [label, before, after] of [
  [
    'tenant helper different fallback',
    'session.user.tenantId?.trim()',
    'session.user.hostTenantId?.trim()',
  ],
  [
    'tenant helper override precedence reversed',
    'session.user.accessTenantId?.trim() || session.user.tenantId?.trim()',
    'session.user.tenantId?.trim() || session.user.accessTenantId?.trim()',
  ],
  [
    'tenant helper optional guard removed',
    'session.user.accessTenantId?.trim()',
    'session.user.accessTenantId.trim()',
  ],
  [
    'tenant helper missing-session denial removed',
    '    throw new UnauthorizedError();',
    '    return "default-tenant";',
  ],
  [
    'tenant helper missing-user denial replaced',
    "throw new UnauthorizedError('Unauthorized: No user in session');",
    "return 'default-tenant';",
  ],
  [
    'tenant helper missing-tenant denial removed',
    'throw new MissingTenantError();',
    "return 'default-tenant';",
  ],
  ['tenant helper constructor import changed', "from './errors'", "from './unreviewed-errors'"],
  [
    'tenant helper extra execution',
    '  return accessTenantId;',
    '  session.user.execute(); return accessTenantId;',
  ],
])
  negative(label, 'sessionSource', before, after);
negative(
  'actual session package mapping changed',
  'sharedAuthPackageSource',
  '"./session": "./src/session.ts"',
  '"./session": "./src/index.ts"'
);
test('missing or invalid source inputs never yield a premise', () => {
  for (const key of Object.keys(input))
    assert.throws(
      () => deriveM4IdentitySource({ ...input, [key]: undefined }),
      /m4 identity source rejected/u
    );
  assert.throws(
    () => deriveM4IdentitySource({ ...input, sharedAuthPackageSource: '{broken' }),
    /resolver JSON/u
  );
});
