import { verifyMessageProofSource } from './db-access-message-proof-source.mjs';
import { verifyNamedProofSource } from './db-access-named-proof-source.mjs';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { digest } from './db-access-trust.mjs';
import { isErasedTypeEdge } from './db-access-module-edges.mjs';

const BASELINE = 'scripts/ci/db-access-baseline.json';
const verified = new WeakSet();
const fail = reason => {
  throw new Error('incomplete: provider unit ' + reason);
};
// Preserve deterministic UTF-16 ordering independently of host locale.
function compareSourceStrings(a, b) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
const ordered = values => [...new Set(values)].sort(compareSourceStrings);
const same = (a, b) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));

function readExact(root, file, expected) {
  if (
    !/^(?:packages|scripts|apps|patches)\//u.test(file) &&
    !['pnpm-lock.yaml', 'pnpm-workspace.yaml'].includes(file)
  )
    fail('unsupported path ' + file);
  const parts = file.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.includes('\\')))
    fail('path escape');
  let current = root;
  for (const part of parts) {
    const aliases = fs
      .readdirSync(current)
      .filter(name => name.normalize('NFC').toLowerCase() === part.normalize('NFC').toLowerCase());
    if (aliases.length !== 1 || aliases[0] !== part) fail('missing or ambiguous path ' + file);
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) fail('symlink ' + file);
  }
  const stat = fs.lstatSync(current);
  if (!stat.isFile() || fs.realpathSync(current) !== current) fail('non-regular path ' + file);
  const mode = stat.mode & 0o111 ? '100755' : '100644';
  const bytes = fs.readFileSync(current);
  if (
    !expected ||
    mode !== expected.mode ||
    bytes.length !== expected.bytes ||
    digest(bytes) !== expected.sha256
  )
    fail('source/mode mismatch ' + file);
  return bytes.toString('utf8');
}

function runtimeEdges(model, file) {
  const source = model.parsed.get(file);
  if (!source || source.parseDiagnostics.length) fail('missing or malformed source ' + file);
  const local = [],
    external = [];
  function record(specifier) {
    const target = model.moduleFile(specifier, file);
    if (target) local.push(target);
    else if (model.externalModule(specifier, file)) external.push(specifier);
    else fail('unresolved dependency ' + file + ' -> ' + specifier);
  }
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && !isErasedTypeEdge(node)) {
        if (!ts.isStringLiteral(node.moduleSpecifier)) fail('non-literal import ' + file);
        record(node.moduleSpecifier.text);
      }
    }
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) fail('require import ' + file);
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression;
      if (
        callee.kind === ts.SyntaxKind.ImportKeyword ||
        /^(?:require|createRequire|eval|Function)$/u.test(callee.getText(source))
      )
        fail('dynamic executable loader ' + file);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return { local: ordered(local), external: ordered(external) };
}

// The caller must obtain policy from the immutable reviewed guard source, never candidate JSON.
// This only authenticates a finite source boundary. It cannot issue runtime admission or PASS.
export function providerUnitResolverSnapshot(repoRoot, adoption, policy) {
  if (!policy || policy.version !== 1 || !/^[a-z0-9-]{1,80}$/u.test(policy.id ?? ''))
    fail('invalid policy');
  if (
    policy.adoptionCommit !== adoption.commit ||
    policy.adoptionTree !== adoption.tree ||
    policy.baselineSha256 !== adoption.files[BASELINE]
  )
    fail('adoption binding mismatch');
  const root = fs.realpathSync(repoRoot);
  readExact(root, BASELINE, {
    mode: '100644',
    bytes: policy.baselineBytes,
    sha256: policy.baselineSha256,
  });
  return new Map(
    Object.entries(policy.resolverFiles ?? {}).map(([file, expected]) => [
      file,
      readExact(root, file, expected),
    ])
  );
}

// These two exact files belong to the directly executed immutable proof producer.
// No ordinary caller, test-name rule, receipt, or business module receives this boundary.
function fixedProducerHarness(root, model, policy, providerFiles) {
  if (!policy.runtimeProofBoundary) return [];
  const expectedFiles = [
    'packages/database/test/rls-role-posture-query.fixture.ts',
    'packages/database/test/rls-role-posture-query.test.ts',
  ];
  if (
    policy.runtimeProofBoundary.id !== 's8-fixed-role-proof-v1' ||
    policy.runtimeProofBoundary.entry !== expectedFiles[1] ||
    !same(Object.keys(policy.runtimeFiles ?? {}), expectedFiles) ||
    policy.runtimeEnforcement?.mode !== 'required-direct-execution' ||
    policy.runtimeEnforcement?.requiredTests !== 9 ||
    policy.runtimeEnforcement?.acceptedReceiptInputs !== false
  )
    fail('invalid fixed producer harness contract');
  const closure = new Set([...providerFiles, ...expectedFiles]);
  for (const file of expectedFiles) {
    const content = readExact(root, file, policy.runtimeFiles[file]);
    if (model.parsed.get(file)?.text !== content)
      fail('producer harness model/source mismatch ' + file);
    const edges = runtimeEdges(model, file);
    if (
      edges.local.some(target => !closure.has(target)) ||
      edges.external.some(target => !target.startsWith('node:') && target !== 'postgres')
    )
      fail('producer harness dependency leaves fixed closure ' + file);
  }
  return expectedFiles;
}

export function verifyProviderUnitSource(repoRoot, model, adoption, policy) {
  providerUnitResolverSnapshot(repoRoot, adoption, policy);
  const root = fs.realpathSync(repoRoot);
  const files = Object.keys(policy.files ?? {});
  if (
    !files.length ||
    files.length > 256 ||
    new Set(files.map(f => f.normalize('NFC').toLowerCase())).size !== files.length
  )
    fail('invalid closure');
  const records = {};
  for (const file of files) {
    const content = readExact(root, file, policy.files[file]);
    if (model.parsed.get(file)?.text !== content) fail('model/source mismatch ' + file);
    const edges = runtimeEdges(model, file);
    if (
      !same(edges.local, policy.files[file].local ?? []) ||
      !same(edges.external, policy.files[file].external ?? [])
    )
      fail('dependency mismatch ' + file);
    if (edges.local.some(target => !Object.hasOwn(policy.files, target)))
      fail('dependency leaves approved closure ' + file);
    records[file] = { sha256: digest(content), ...edges };
  }
  for (const [file, expected] of Object.entries(policy.resolverFiles ?? {}))
    readExact(root, file, expected);
  const publicModules = policy.publicModules ?? [];
  if (publicModules.some(file => !Object.hasOwn(records, file))) fail('unknown public entry');
  const harness = policy.testHarness ?? {};
  for (const [file, expected] of Object.entries(harness)) readExact(root, file, expected);
  const producerHarnessFiles = fixedProducerHarness(root, model, policy, files);
  const namedProofFiles = verifyNamedProofSource(root, model, policy, readExact);
  const messageProof = verifyMessageProofSource(root, model, policy, readExact);
  const producerHarness = new Set(producerHarnessFiles);
  const incoming = [];
  for (const [file, source] of model.parsed) {
    if (Object.hasOwn(records, file)) continue;
    function visit(node) {
      let specifier;
      if (
        (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        !isErasedTypeEdge(node) &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        specifier = node.moduleSpecifier.text;
      if (
        ts.isCallExpression(node) &&
        (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
          (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
        node.arguments.length === 1 &&
        ts.isStringLiteral(node.arguments[0])
      )
        specifier = node.arguments[0].text;
      if (
        ts.isImportEqualsDeclaration(node) &&
        !node.isTypeOnly &&
        ts.isExternalModuleReference(node.moduleReference) &&
        node.moduleReference.expression &&
        ts.isStringLiteral(node.moduleReference.expression)
      )
        specifier = node.moduleReference.expression.text;
      if (specifier !== undefined) {
        const target = model.moduleFile(specifier, file);
        if (producerHarness.has(target) && !producerHarness.has(file))
          fail('ordinary consumer imports fixed producer harness ' + file + ' -> ' + target);
        if (Object.hasOwn(records, target ?? '')) {
          const permitted =
            publicModules.includes(target) ||
            Object.hasOwn(harness, file) ||
            (policy.privateImporters?.[target] ?? []).includes(file);
          if (!permitted) fail('unauthorized incoming import ' + file + ' -> ' + target);
          incoming.push({ file, target });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  const result = Object.freeze({
    id: policy.id,
    files: Object.freeze(files.sort(compareSourceStrings)),
    producerHarnessFiles: Object.freeze(producerHarnessFiles),
    namedProofFiles: Object.freeze(namedProofFiles),
    messageProof,
    sourceDigest: digest(JSON.stringify(records)),
    policyDigest: digest(JSON.stringify(policy)),
    adoptionCommit: adoption.commit,
    adoptionTree: adoption.tree,
    baselineSha256: policy.baselineSha256,
    incoming: Object.freeze(incoming.map(edge => Object.freeze(edge))),
    runtimeAdmission: false,
  });
  verified.add(result);
  return result;
}

export const isVerifiedProviderUnitSource = record => verified.has(record);

// Internal declarations remain resolvable, but their frozen implementation is not re-expanded
// as consumer code. Full inventory/reporting still uses the original complete model.
export function providerUnitAnalysisModel(model, unit, preserveNamedInventory = false) {
  if (!verified.has(unit)) fail('unauthenticated analysis boundary');
  const files = new Set([
    ...unit.files,
    ...unit.producerHarnessFiles,
    ...(preserveNamedInventory ? [] : unit.namedProofFiles),
  ]);
  return {
    ...model,
    parsed: new Map([...model.parsed].filter(([file]) => !files.has(file))),
    walk(node, visitor) {
      if (node && files.has(model.fileOf(node))) return;
      return model.walk(node, visitor);
    },
    providerCanonical(declaration) {
      return (
        files.has(model.fileOf(declaration)) &&
        model.fileOf(declaration) === 'packages/database/src/owned-tenant-context.ts' &&
        declaration.name?.text === 'withOwnedTenantContext'
      );
    },
  };
}
