// Actual finite A1 source construction only; bootstrap/vendor/runtime/context proof stays open.
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readRuntimeModule, runtimeTree } from './db-access-m4-controller-ast.mjs';
import { canon, canonicalJson, deepFreeze } from './db-access-m4-syntax.mjs';
import {
  VERIFIER_CONTRACT,
  USER_SCHEMA_CONTRACT,
  SESSION_CONTRACT,
  SESSION_RESOLVER_CONTRACT,
} from './db-access-m4-identity-contract.mjs';

export const M4_IDENTITY_FILES = Object.freeze({
  verifier: 'apps/web/src/lib/auth/current-store-session.ts',
  userSchema: 'apps/web/src/lib/auth/user-schema.ts',
  session: 'packages/shared-auth/src/session.ts',
  resolver: 'packages/shared-auth/package.json',
});
const digest = text => createHash('sha256').update(text).digest('hex');
const reject = label => {
  throw new Error('m4 identity source rejected: ' + label);
};
const need = (condition, label) => {
  if (!condition) reject(label);
};
const same = (actual, expected, label) =>
  need(canonicalJson(actual) === canonicalJson(expected), label);
function parse(text, file) {
  need(typeof text === 'string', 'source text missing: ' + file);
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  need(source.parseDiagnostics.length === 0, 'malformed source: ' + file);
  return source;
}
function verifier(text) {
  const actual = readRuntimeModule(text, M4_IDENTITY_FILES.verifier),
    expected = readRuntimeModule(VERIFIER_CONTRACT, M4_IDENTITY_FILES.verifier);
  same(actual.imports, expected.imports, 'verifier imports');
  same([...actual.functions.keys()], [...expected.functions.keys()], 'verifier function set');
  need(actual.constants.size === 0, 'verifier module initializer');
  // The shared controller grammar intentionally has a smaller intrinsic set. Only these
  // fixed global constructors are added for this exact A1 contract; no caller names are trusted.
  for (const module of [actual, expected])
    for (const name of ['URL', 'Headers']) {
      need(!module.names.has(name), 'shadowed identity constructor');
      module.names.set(name, 'global:' + name);
    }
  const functions = {},
    observed = new WeakMap();
  for (const [name, node] of actual.functions) {
    functions[name] = runtimeTree(node, actual, true, observed);
    same(
      functions[name],
      runtimeTree(expected.functions.get(name), expected, true),
      'verifier control/effect ' + name
    );
  }
  const authority = actual.functions.get('createCurrentStoreSessionVerifier');
  const returned = authority.body.statements.at(-1);
  const verify = returned.expression;
  need(ts.isFunctionExpression(verify), 'private verification closure');
  const body = verify.body.statements[1].tryBlock;
  const labels = [
    'read-current-session',
    'deny-absent-session',
    'select-current-user',
    'select-home-tenant',
    'derive-current-access-tenant',
    'validate-projected-identities',
    'return-frozen-principal',
  ];
  need(body.statements.length === labels.length, 'session clause coverage');
  return {
    imports: actual.imports,
    functions,
    clauses: labels.map((step, index) => ({ step, tree: observed.get(body.statements[index]) })),
  };
}
function schemaValue(text) {
  const source = parse(text, M4_IDENTITY_FILES.userSchema);
  need(source.statements.length === 2, 'schema module contains extra execution');
  const [imported, statement] = source.statements;
  need(
    ts.isImportDeclaration(imported) &&
      imported.importClause?.isTypeOnly &&
      !imported.attributes &&
      ts.isStringLiteral(imported.moduleSpecifier) &&
      imported.moduleSpecifier.text === 'better-auth' &&
      !imported.importClause.name &&
      ts.isNamedImports(imported.importClause.namedBindings) &&
      imported.importClause.namedBindings.elements.length === 1 &&
      imported.importClause.namedBindings.elements[0].name.text === 'BetterAuthOptions' &&
      !imported.importClause.namedBindings.elements[0].propertyName,
    'schema erased import'
  );
  need(
    ts.isVariableStatement(statement) &&
      statement.modifiers?.length === 1 &&
      statement.modifiers[0].kind === ts.SyntaxKind.ExportKeyword &&
      statement.declarationList.flags === ts.NodeFlags.Const &&
      statement.declarationList.declarations.length === 1,
    'schema export'
  );
  const [declaration] = statement.declarationList.declarations;
  need(
    ts.isIdentifier(declaration.name) &&
      declaration.name.text === 'userSchemaConfig' &&
      ts.isSatisfiesExpression(declaration.initializer),
    'schema binding'
  );
  const expected = parse(USER_SCHEMA_CONTRACT, M4_IDENTITY_FILES.userSchema).statements[1]
    .declarationList.declarations[0];
  same(canon(declaration.initializer.type), canon(expected.initializer.type), 'schema type target');
  return runtimeTree(declaration.initializer.expression, { names: new Map() });
}
function session(text) {
  const actual = readRuntimeModule(text, M4_IDENTITY_FILES.session),
    expected = readRuntimeModule(SESSION_CONTRACT, M4_IDENTITY_FILES.session);
  same(actual.imports, expected.imports, 'session imports');
  same([...actual.names], [...expected.names], 'session local callee bindings');
  need(actual.constants.size === 0, 'session initializer');
  const functions = {};
  for (const [name, node] of actual.functions) {
    const required = expected.functions.get(name);
    need(
      required &&
        node.parameters.length === 1 &&
        ts.isIdentifier(node.parameters[0].name) &&
        node.parameters[0].name.text === 'session' &&
        !node.parameters[0].initializer &&
        !node.parameters[0].dotDotDotToken &&
        !node.parameters[0].modifiers?.length &&
        node.modifiers?.length === 1 &&
        node.modifiers[0].kind === ts.SyntaxKind.ExportKeyword,
      'session function signature'
    );
    // This narrower grammar retains the real optional-chain nodes. It does not erase ?.
    // or presume that an imported function is safe because of its export name.
    functions[name] = canon(node.body);
    same(functions[name], canon(required.body), 'session control/effect ' + name);
  }
  return {
    imports: actual.imports,
    functions,
    accessTenantOrder: ['current.user.accessTenantId?.trim()', 'current.user.tenantId?.trim()'],
    missingThrows: true,
  };
}
export function deriveM4IdentitySource({
  verifierSource,
  userSchemaSource,
  sessionSource,
  sharedAuthPackageSource,
}) {
  const sources = {
    verifier: verifierSource,
    userSchema: userSchemaSource,
    session: sessionSource,
    resolver: sharedAuthPackageSource,
  };
  for (const [key, value] of Object.entries(sources))
    need(typeof value === 'string', 'missing ' + key + ' source');
  let resolver;
  try {
    resolver = JSON.parse(sharedAuthPackageSource);
  } catch {
    reject('resolver JSON');
  }
  same(resolver, SESSION_RESOLVER_CONTRACT, 'actual shared-auth package resolver');
  const schema = schemaValue(userSchemaSource);
  same(schema, schemaValue(USER_SCHEMA_CONTRACT), 'schema fields and protected input controls');
  const facts = {
    verifier: verifier(verifierSource),
    userSchema: schema,
    session: session(sessionSource),
    resolvedAccessTenantCallee: {
      specifier: '@interdomestik/shared-auth/session',
      target: M4_IDENTITY_FILES.session,
      export: 'ensureAccessTenantId',
    },
  };
  return deepFreeze({
    version: 1,
    identityPremiseOnly: true,
    runtimeAdmission: false,
    sourceSha256: Object.fromEntries(
      Object.entries(sources).map(([key, text]) => [M4_IDENTITY_FILES[key], digest(text)])
    ),
    facts,
    factsSha256: digest(canonicalJson(facts)),
    guarantees: [
      'factory validates original issuer URL shape and secret minimum, preserving issuer baseURL for provider cookie semantics',
      'private provider configuration exposes only getSession through a cookie-only fresh Headers object',
      'cookie cache and refresh disabled on every verification call; vendor SQL logging disabled',
      'current provider user/session values alone supply the validated frozen six-field principal',
      'getSession absence or any verification/store/cleanup exception returns null; no prior-positive fallback',
      'tenant helper actual AST and package resolution are bound; protected user-schema input fields remain false',
    ],
    premises: [
      'Private bootstrap must supply the real qualified identity-purpose database and original issuer URL/secret; this factory accepts configuration and does not authenticate that provisioning.',
      'Installed Better Auth, Drizzle adapter, database/schema, shared-auth error constructors, crypto, URL/Headers and every loader/import/initializer require authenticated dependency source and runtime qualification.',
      'The fixed source checks getSession invocation and returned-value handling; actual signature verification, uncached current-store reads, expired-session DELETE semantics, role grants and store-failure behavior still require executed proof.',
      'Builtins and globals are unmodified in the qualified image; no runtime compartment/capability guarantee follows from source matching.',
      'All use contexts, native inventory/diagnostic lineage and protected producer/source/policy/event binding remain open; this is neither mounted admission nor full M4/S8 acceptance.',
    ],
  });
}
