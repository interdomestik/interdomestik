// Finite source/control proof only. No runtime or native admission is minted here.
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readRuntimeModule, runtimeTree, reject } from './db-access-m4-assignment-kernel-ast.mjs';
import { CONTRACT as shared } from './db-access-m4-shared-kernel-contract.mjs';
import { CONTRACT as legacy } from './db-access-m4-legacy-kernel-contract.mjs';
import { CONTRACT as staff } from './db-access-m4-staff-kernel-contract.mjs';
const contracts = Object.freeze({ shared, legacy, staff });
export const FILES = Object.freeze({
  shared: 'apps/web/src/server/operations/m4-assignment-kernel-shared.ts',
  legacy: 'apps/web/src/server/operations/m4-legacy-assignment-kernel.ts',
  staff: 'apps/web/src/server/operations/m4-staff-assignment-kernel.ts',
});
const hash = text => createHash('sha256').update(text).digest('hex');
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const equal = (actual, expected, label) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) reject(label);
};
function deriveModule(source, contract, file) {
  const actual = readRuntimeModule(source, file);
  const expected = readRuntimeModule(contract, file);
  equal(actual.imports, expected.imports, file + ': import identities');
  equal([...actual.constants.keys()], [...expected.constants.keys()], file + ': constants');
  equal([...actual.functions.keys()], [...expected.functions.keys()], file + ': functions');
  const functions = {},
    constants = {},
    observed = new WeakMap(),
    clauses = {};
  for (const [name, node] of actual.constants) {
    constants[name] = runtimeTree(node, actual);
    equal(constants[name], runtimeTree(expected.constants.get(name), expected), name);
  }
  for (const [name, node] of actual.functions) {
    functions[name] = runtimeTree(node, actual, true, observed);
    equal(
      functions[name],
      runtimeTree(expected.functions.get(name), expected, true),
      file + ': ordered control/effect ' + name
    );
    clauses[name] = node.body.statements.map((statement, index) => ({
      index,
      start: statement.getStart(actual.source),
      end: statement.getEnd(),
      kind: ts.SyntaxKind[statement.kind],
      tree: observed.get(statement),
    }));
  }
  const effects = [];
  function visit(node) {
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const start = node.getStart(actual.source),
        end = node.getEnd();
      effects.push({
        file,
        start,
        end,
        kind: ts.SyntaxKind[node.kind],
        expressionSha256: hash(source.slice(start, end)),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(actual.source);
  return { imports: actual.imports, constants, functions, clauses, effects };
}
export function deriveM4AssignmentKernels({ sharedSource, legacySource, staffSource }) {
  const sources = { shared: sharedSource, legacy: legacySource, staff: staffSource };
  const facts = Object.fromEntries(
    Object.keys(FILES).map(role => [
      role,
      deriveModule(sources[role], contracts[role], FILES[role]),
    ])
  );
  // Position-independent normalized facts preserve comment/layout/local-alias equivalence.
  const normalized = Object.fromEntries(
    Object.entries(facts).map(([role, fact]) => [
      role,
      { imports: fact.imports, constants: fact.constants, functions: fact.functions },
    ])
  );
  return freeze({
    version: 1,
    sourcePremiseOnly: true,
    runtimeAdmission: false,
    allExecutableContextsQualified: false,
    productionEventAuthenticated: false,
    sourceSha256: Object.fromEntries(
      Object.entries(FILES).map(([role, file]) => [file, hash(sources[role])])
    ),
    facts,
    factsSha256: hash(JSON.stringify(normalized)),
    guarantees: [
      'Shared staff scope binds claim and tenant, then current branch or own/unassigned resource; snapshot CAS binds assignment, branch and both lifecycle fields.',
      'Every non-null requested target, including self and no-op, is read under FOR SHARE with current id, tenant and staff role; staff profile also binds current actor branch.',
      'Legacy literal admin skips eligible no-op before terminal-write denial; literal agent same-target remains a write requiring nonterminal lifecycle and awaited audit, with a private notification receipt only when the selected target has an email.',
      'Staff omitted target means self, explicit null clears; eligible same-target no-op precedes terminal-write denial and preserves metadata.',
      'Legacy writes only staffId; staff writes only staffId, assignedAt, assignedById and updatedAt with fixed current actor/null/time semantics.',
      'Both writers lock current resource FOR UPDATE, retain scope and lifecycle/assignment CAS, and require a returned row before awaited same-transaction audit.',
      'Audit binds current actor/tenant and previous/next assignment; observation is bounded and explicitly nonauthoritative web-relay-reported metadata.',
      'No catch, retry, alternate database path or configurable dispatch exists in these kernels; SQL/audit failures escape to the caller-owned transaction.',
      'Legacy notification data remains private outcome data; notifier dispatch, external delivery and public DTO confinement require their separate controller/runtime proofs.',
    ],
    premises: [
      'The caller must supply the actual owned restricted transaction, current FOR SHARE actor, authenticated current session and source-bound fixed entry; these function parameters do not confer authority.',
      'Schema columns, Drizzle operators, lifecycle conversion and terminal classification, nanoid, Date and installed database/driver behavior require exact dependency closure and execution qualification.',
      'Real transaction commit/rollback, row-lock concurrency, RLS grants/posture, target transitions, CAS conflicts and mandatory audit rollback require actual SQL cases.',
      'Bootstrap, notifier, notification purpose pool/transport, ingress/cache behavior and all native use contexts remain separate unresolved premises.',
      'Immutable producer, authenticated source/policy/event, model bookends and native all-context join must bind this derivation before any trusted/proof classification; production C is not admitted.',
    ],
  });
}
