import ts from 'typescript';
import { namedProofEdges } from './db-access-named-proof-source.mjs';
import { isErasedTypeEdge } from './db-access-module-edges.mjs';
import {
  MESSAGE_CLOSURE_LIMIT,
  MESSAGE_FIXTURE,
  MESSAGE_MODULE_URLS,
  MESSAGE_PRIVATE_EDGES,
  MESSAGE_PRIVATE_FILES,
  assertMessageContract,
  messageUrlTarget,
} from './db-access-message-proof-registry.mjs';

// V2 is a local compatibility contract for the registered message family only.
export const MESSAGE_PROOF_FILES = MESSAGE_PRIVATE_FILES;
const PRIVATE = new Set(MESSAGE_PRIVATE_FILES);
const authenticated = new WeakSet();
const fail = reason => {
  throw new Error('incomplete: message proof ' + reason);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const ordered = values => [...new Set(values)].sort();
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};

export function messageProofEdges(model, file) {
  return namedProofEdges(
    {
      ...model,
      // The fixture's direct driver is fixed by the producer lock, not hoisted resolution.
      externalModule: (name, from) =>
        model.externalModule(name, from) || (name === 'postgres' && from === MESSAGE_FIXTURE),
    },
    file
  );
}

// Only the exact registered private-to-private edges exist; widening or removal refuses.
export function assertPrivateEdges(file, edges) {
  const actual = ordered(Object.values(edges).filter(target => PRIVATE.has(target)));
  if (!same(actual, ordered(MESSAGE_PRIVATE_EDGES[file] ?? [])))
    fail('private harness edge mismatch ' + file);
}

// `new URL(<literal>, import.meta.url)` names a file executed without an import edge.
// Private files must use literals only; ordinary files are only scanned for private targets.
export function moduleUrls(source, file, strict = true) {
  const urls = [];
  function visit(node) {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'URL' &&
      node.arguments?.length === 2 &&
      node.arguments[1].getText(source) === 'import.meta.url'
    ) {
      if (ts.isStringLiteralLike(node.arguments[0])) urls.push(node.arguments[0].text);
      else if (strict) fail('non-literal module URL ' + file);
    }
    if (
      strict &&
      ts.isPropertyAccessExpression(node) &&
      node.getText(source) === 'import.meta.resolve'
    )
      fail('module resolver ' + file);
    ts.forEachChild(node, visit);
  }
  visit(source);
  return urls;
}

function importSpecifier(node, source) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && !isErasedTypeEdge(node))
    return node.moduleSpecifier;
  if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      node.expression.getText(source) === 'require')
  )
    return node.arguments[0];
  if (
    ts.isImportEqualsDeclaration(node) &&
    !node.isTypeOnly &&
    ts.isExternalModuleReference(node.moduleReference)
  )
    return node.moduleReference.expression;
  return undefined;
}

function rejectOrdinaryConsumers(model) {
  for (const [file, source] of model.parsed) {
    if (PRIVATE.has(file)) continue;
    function visit(node) {
      const specifier = importSpecifier(node, source);
      if (
        specifier &&
        ts.isStringLiteral(specifier) &&
        PRIVATE.has(model.moduleFile(specifier.text, file))
      )
        fail('ordinary consumer imports private harness ' + file);
      ts.forEachChild(node, visit);
    }
    visit(source);
    if (moduleUrls(source, file, false).some(url => PRIVATE.has(messageUrlTarget(file, url))))
      fail('ordinary consumer references private harness ' + file);
  }
}

// HOLD: sources are authenticated but nothing is discharged; native rows are only reported.
// BOUND: exactly the protected rows on the eight private files may become runtime obligations.
function verifyWitnessInventory(contract) {
  const inventory = contract.witnessInventory;
  const identities = contract.identities;
  const unknown = contract.unknownWitnesses;
  if (!Array.isArray(identities) || !Array.isArray(unknown)) fail('finite witnesses');
  if (inventory?.state === 'hold') {
    if (
      inventory.operations !== 0 ||
      inventory.diagnostics !== 0 ||
      identities.length ||
      unknown.length
    )
      fail('finite witnesses: HOLD inventory cannot discharge rows');
    return;
  }
  if (inventory?.state !== 'bound') fail('witness inventory neither HOLD nor bound');
  if (
    !Number.isSafeInteger(inventory.operations) ||
    identities.length !== inventory.operations ||
    new Set(identities.map(entry => entry.identity)).size !== identities.length ||
    identities.some(entry => !PRIVATE.has(entry.file))
  )
    fail('finite operation witnesses');
  const key = entry => JSON.stringify([entry.file, entry.reason, entry.occurrences]);
  if (
    !Number.isSafeInteger(inventory.diagnostics) ||
    unknown.length !== inventory.diagnostics ||
    new Set(unknown.map(key)).size !== unknown.length ||
    unknown.some(
      entry =>
        !PRIVATE.has(entry.file) ||
        !Number.isSafeInteger(entry.occurrences) ||
        entry.occurrences < 1
    )
  )
    fail('finite diagnostic witnesses');
}

export function verifyMessageProofSource(root, model, policy, readExact) {
  const contract = policy.messageProof;
  if (!contract) return undefined;
  assertMessageContract(contract, fail);
  if (
    Object.keys(contract.files).length > MESSAGE_CLOSURE_LIMIT ||
    MESSAGE_PRIVATE_FILES.some(file => !Object.hasOwn(contract.files, file))
  )
    fail('finite closure');
  for (const [file, expected] of Object.entries(contract.files)) {
    const source = readExact(root, file, expected);
    const parsed = model.parsed.get(file);
    if (parsed?.text !== source) fail('model/source mismatch ' + file);
    const edges = messageProofEdges(model, file);
    if (!same(edges, expected.imports)) fail('dependency mismatch ' + file);
    if (Object.values(edges).some(target => target && !contract.files[target]))
      fail('dependency leaves fixed closure ' + file);
    assertPrivateEdges(file, edges);
    if (PRIVATE.has(file) && !same(moduleUrls(parsed, file), MESSAGE_MODULE_URLS[file] ?? []))
      fail('private module URL mismatch ' + file);
  }
  for (const [file, expected] of Object.entries(contract.configuration))
    readExact(root, file, expected);
  for (const [file, expected] of Object.entries(contract.migrations))
    readExact(root, file, expected);
  rejectOrdinaryConsumers(model);
  verifyWitnessInventory(contract);
  const result = freeze(structuredClone(contract));
  authenticated.add(result);
  return result;
}

const heldRows = rows =>
  Object.freeze(rows.filter(row => PRIVATE.has(row?.file)).map(row => Object.freeze({ ...row })));

// Evaluate the original graph first. Only exact authenticated witnesses receive an
// additional runtime obligation; no model body, inventory entry or diagnostic is erased.
export function messageProofObligations(contract, failures, incomplete) {
  if (!contract) return { operations: [], unknown: [], remaining: incomplete };
  if (!authenticated.has(contract)) fail('unauthenticated obligations');
  if (contract.witnessInventory.state === 'hold') {
    // Report-only copies for the owner's HOLD/no-discharge assembly; nothing leaves failures.
    return {
      operations: [],
      unknown: [],
      remaining: [...incomplete],
      held: Object.freeze({
        operations: heldRows([...failures.values()]),
        unknown: heldRows(incomplete),
      }),
    };
  }
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
