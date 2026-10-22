import { namedProofEdges } from './db-access-named-proof-source.mjs';
import ts from 'typescript';
import { isErasedTypeEdge } from './db-access-module-edges.mjs';

export const MESSAGE_PROOF_FILES = Object.freeze([
  'packages/domain-communications/src/messages/tenant-context.integration-fixture.ts',
  'packages/domain-communications/src/messages/tenant-context.integration.test.ts',
]);
const authenticated = new WeakSet();
const fail = reason => {
  throw new Error('incomplete: message proof ' + reason);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function messageProofEdges(model, file) {
  return namedProofEdges(
    {
      ...model,
      // The fixture's direct driver is fixed by the producer lock, not hoisted resolution.
      externalModule: (name, from) =>
        model.externalModule(name, from) ||
        (name === 'postgres' && from === MESSAGE_PROOF_FILES[0]),
    },
    file
  );
}

export function verifyMessageProofSource(root, model, policy, readExact) {
  const contract = policy.messageProof;
  if (!contract) return undefined;
  if (
    contract.id !== 's8-message-integration-proof-v1' ||
    !same(contract.operations, MESSAGE_PROOF_FILES) ||
    contract.requiredTests !== 9 ||
    contract.runtimeRequired !== true ||
    contract.acceptedReceiptInputs !== false
  )
    fail('contract identity');
  if (
    Object.keys(contract.files).length > 128 ||
    MESSAGE_PROOF_FILES.some(file => !contract.files[file])
  )
    fail('finite closure');
  for (const [file, expected] of Object.entries(contract.files)) {
    const source = readExact(root, file, expected);
    if (model.parsed.get(file)?.text !== source) fail('model/source mismatch ' + file);
    const edges = messageProofEdges(model, file);
    if (!same(edges, expected.imports)) fail('dependency mismatch ' + file);
    if (Object.values(edges).some(target => target && !contract.files[target]))
      fail('dependency leaves fixed closure ' + file);
  }
  for (const [file, expected] of Object.entries(contract.configuration))
    readExact(root, file, expected);
  for (const [file, expected] of Object.entries(contract.migrations))
    readExact(root, file, expected);
  for (const [file, source] of model.parsed) {
    if (MESSAGE_PROOF_FILES.includes(file)) continue;
    function visit(node) {
      let specifier;
      if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && !isErasedTypeEdge(node))
        specifier = node.moduleSpecifier;
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          node.expression.getText(source) === 'require')
      )
        specifier = node.arguments[0];
      if (
        ts.isImportEqualsDeclaration(node) &&
        !node.isTypeOnly &&
        ts.isExternalModuleReference(node.moduleReference)
      )
        specifier = node.moduleReference.expression;
      if (
        specifier &&
        ts.isStringLiteral(specifier) &&
        MESSAGE_PROOF_FILES.includes(model.moduleFile(specifier.text, file))
      )
        fail('ordinary consumer imports private harness ' + file);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  if (
    contract.identities.length !== 24 ||
    new Set(contract.identities.map(e => e.identity)).size !== 24 ||
    contract.identities.some(e => !MESSAGE_PROOF_FILES.includes(e.file)) ||
    contract.unknownWitnesses.length !== 115 ||
    contract.unknownWitnesses.some(e => !MESSAGE_PROOF_FILES.includes(e.file))
  )
    fail('finite witnesses');
  const freeze = value => {
    if (value && typeof value === 'object') {
      for (const child of Object.values(value)) freeze(child);
      Object.freeze(value);
    }
    return value;
  };
  const result = freeze(structuredClone(contract));
  authenticated.add(result);
  return result;
}

// Evaluate the original graph first. Only exact authenticated witnesses receive an
// additional runtime obligation; no model body, inventory entry or diagnostic is erased.
export function messageProofObligations(contract, failures, incomplete) {
  if (!contract) return { operations: [], unknown: [], remaining: incomplete };
  if (!authenticated.has(contract)) fail('unauthenticated obligations');
  const operations = [];
  for (const expected of contract.identities) {
    const actual = failures.get(expected.identity);
    if (
      !actual ||
      actual.file !== expected.file ||
      actual.method !== expected.method ||
      actual.callee !== expected.callee ||
      actual.reason !== expected.reason
    )
      fail('operation witness drift ' + expected.identity);
    operations.push(actual);
  }
  const unknown = [],
    remaining = [];
  const key = e => JSON.stringify([e.file, e.reason, e.occurrences]);
  const expected = new Set(contract.unknownWitnesses.map(key));
  if (expected.size !== contract.unknownWitnesses.length) fail('duplicate UNKNOWN witness');
  for (const witness of incomplete) {
    if (expected.delete(key(witness))) unknown.push(witness);
    else remaining.push(witness);
  }
  if (expected.size) fail('missing UNKNOWN witness');
  for (const entry of operations) failures.delete(entry.identity);
  return { operations, unknown, remaining };
}
