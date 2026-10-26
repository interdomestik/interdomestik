// Source/control premise only: neither a matching hash nor this result grants runtime admission.
import ts from 'typescript';
import { createHash } from 'node:crypto';
import { readRuntimeModule, runtimeTree, reject } from './db-access-m4-four-controller-ast.mjs';
import { CONTRACTS } from './db-access-m4-four-controller-contract.mjs';
export const FILES = Object.freeze({
  controller: 'apps/web/src/server/operations/m4-ops-controller.ts',
  wire: 'apps/web/src/server/operations/m4-assignment-wire.ts',
  protocol: 'apps/web/src/server/operations/m4-assignment-protocol.ts',
});
const digest = text => createHash('sha256').update(text).digest('hex');
const equal = (a, b, label) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) reject(label);
};
const freeze = value => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
function construct(text, contract, file) {
  const actual = readRuntimeModule(text, file),
    expected = readRuntimeModule(contract, file);
  equal(actual.imports, expected.imports, file + ': imports');
  equal([...actual.functions.keys()], [...expected.functions.keys()], file + ': functions');
  equal([...actual.constants.keys()], [...expected.constants.keys()], file + ': constants');
  const constants = {},
    functions = {},
    observed = new WeakMap();
  for (const [name, node] of actual.constants) {
    constants[name] = runtimeTree(node, actual);
    equal(
      constants[name],
      runtimeTree(expected.constants.get(name), expected),
      file + ': constant ' + name
    );
  }
  for (const [name, node] of actual.functions) {
    functions[name] = runtimeTree(node, actual, true, observed);
    equal(
      functions[name],
      runtimeTree(expected.functions.get(name), expected, true),
      file + ': control/effect ' + name
    );
  }
  return { actual, observed, derivation: { imports: actual.imports, constants, functions } };
}
function ownedClauses(controller) {
  const constructor = controller.actual.functions.get('createPrivateAssignmentController');
  const callbacks = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'transaction'
    ) {
      const callback = node.arguments[0];
      if (!callback || !ts.isArrowFunction(callback) || !ts.isBlock(callback.body))
        reject('owned callback shape');
      callbacks.push(callback);
    }
    ts.forEachChild(node, visit);
  }
  visit(constructor);
  if (callbacks.length !== 1) reject('one concrete owned transaction');
  // Complete AST equivalence already proves this is the captured database receiver, awaited and
  // admitted in the exact fixed sequence. Indexes describe actual source trees, not exemptions.
  return callbacks[0].body.statements.map((statement, index) => ({
    index,
    kind: ts.SyntaxKind[statement.kind],
    tree: controller.observed.get(statement),
  }));
}
function sourceNodes(source, file) {
  const nodes = [];
  function visit(node) {
    if (
      ts.isCallExpression(node) ||
      ts.isTaggedTemplateExpression(node) ||
      ts.isNewExpression(node)
    ) {
      const start = node.getStart(source),
        end = node.getEnd();
      nodes.push({
        file,
        start,
        end,
        line: source.getLineAndCharacterOfPosition(start).line + 1,
        kind: ts.SyntaxKind[node.kind],
        expressionSha256: digest(source.text.slice(start, end)),
      });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return nodes;
}
export function deriveM4AssignmentControllers({ controllerSource, wireSource, protocolSource }) {
  const sources = { controller: controllerSource, wire: wireSource, protocol: protocolSource };
  const modules = Object.fromEntries(
    Object.keys(FILES).map(key => [key, construct(sources[key], CONTRACTS[key], FILES[key])])
  );
  const facts = {
    controller: modules.controller.derivation,
    wire: modules.wire.derivation,
    protocol: modules.protocol.derivation,
    ownedClauses: ownedClauses(modules.controller),
  };
  return freeze({
    version: 2,
    controllerPremiseOnly: true,
    runtimeAdmission: false,
    sourceSha256: Object.fromEntries(
      Object.keys(FILES).map(key => [FILES[key], digest(sources[key])])
    ),
    facts,
    factsSha256: digest(JSON.stringify(facts)),
    sourceNodes: Object.keys(FILES).flatMap(key =>
      sourceNodes(modules[key].actual.source, FILES[key])
    ),
    guarantees: [
      'Four literal private factory bindings; source-selected profiles and captured concrete legacy notifier; no request handler registry.',
      'A1 after owned transaction acquisition; current actor/home role and branch FOR SHARE; current effective resource scope FOR UPDATE before ledger replay.',
      'Legacy admin home/access and current staff branch/assignment/self authority remain before replay.',
      'Ops exact six-field fingerprint; legacy/staff add fixed entry identity; all six stored conflict fields retained.',
      'Strict serialized observation and fixed stored result/changed projection; private notification reference contains no email/title/name.',
      'Every newly completed denial/no-op/success inserts its result on the same transaction; unexpected SQL escapes and remains indeterminate without retry.',
      'Captured notifier runs only after initial committed success with private receipt; postcommit failure is independent and content-free.',
    ],
    premises: [
      'The actual literal private runtime/bootstrap must construct each factory with the real A1 verifier, restricted owned database and concrete assignment notifier instance; factory parameter types do not authenticate configuration.',
      'Actual ops and V3 legacy/staff kernels, shared scope/audit helpers, notifier, schema/operators/crypto and every import/initializer/vendor/loader closure require separate source-bound derivations.',
      'Notifier committed-result/fingerprint/target/claim validation, restricted purpose pool/deadline, notification store and actual email transport source/runtime remain separately required.',
      'Current-store A1 and actual transaction ownership/commit/rollback, RLS/nonownership/no privilege recovery, concurrency/replay and driver/deadline execution require real proof.',
      'Actual ingress/observation and cache adapters, all executable use contexts and source/policy/event/protected producer joins remain required; no old or new identity/diagnostic is exempted.',
      'Promise and console are explicitly fixed source intrinsics for this private postcommit sequence; unmodified builtins/image isolation are a remaining premise, not inferred from syntax.',
    ],
  });
}
