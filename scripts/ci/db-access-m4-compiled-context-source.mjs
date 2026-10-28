// Fixed-source requirements are derived before examining runtime success or native membership.
import ts from 'typescript';
import { exact } from './db-access-provider-runtime-identity.mjs';
import { fileURLToPath } from 'node:url';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { digest, hash, same, fail } from './db-access-m4-compiled-context-common.mjs';
export const TRUSTED_FILES = Object.freeze([
  'apps/web/src/features/admin/claims/actions/ops-assignment.ts',
  'apps/web/src/server/operations/m4-ops-controller.ts',
  'apps/web/src/server/operations/m4-assignment-kernel-shared.ts',
  'apps/web/src/server/operations/m4-legacy-assignment-kernel.ts',
  'apps/web/src/server/operations/m4-staff-assignment-kernel.ts',
  'apps/web/src/lib/auth/current-store-session.ts',
  'apps/web/src/server/operations/m4-notification-runtime.ts',
  'apps/web/src/server/operations/m4-assignment-postcommit.ts',
]);
const STAFF_EXECUTION_PROFILE = 'staff';
const ALL_PROFILES = ['ops', 'legacy-admin', 'legacy-agent', STAFF_EXECUTION_PROFILE];
function profilesFor(file) {
  if (file.endsWith('/ops-assignment.ts')) return ['ops'];
  if (file.endsWith('/m4-legacy-assignment-kernel.ts')) return ['legacy-admin', 'legacy-agent'];
  if (file.endsWith('/m4-staff-assignment-kernel.ts')) return [STAFF_EXECUTION_PROFILE];
  if (file.endsWith('/m4-assignment-kernel-shared.ts'))
    return ['legacy-admin', 'legacy-agent', 'staff'];
  return ALL_PROFILES;
}
const METHODS = new Set([
  'select',
  'insert',
  'update',
  'delete',
  'execute',
  'transaction',
  'query',
]);
export function extractCompiledTrustedOperations(file, text) {
  const unit = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  if (unit.parseDiagnostics.length) fail('trusted source parse');
  const operations = [];
  const locate = node => [file, node.pos, node.end, node.kind];
  function walk(node, owner) {
    if (ts.isFunctionLike(node)) owner = node;
    const databaseReceiver = part =>
      ts.isIdentifier(part)
        ? ['tx', 'database'].includes(part.text)
        : ts.isPropertyAccessExpression(part) &&
          ts.isIdentifier(part.expression) &&
          part.expression.text === 'owned' &&
          part.name.text === 'database';
    if (ts.isElementAccessExpression(node) && databaseReceiver(node.expression))
      fail('unsupported computed database callee');
    if (ts.isPropertyAccessExpression(node) && databaseReceiver(node.expression)) {
      if (!METHODS.has(node.name.text)) fail('unsupported fixed database callee');
      if (!owner) fail('unowned privileged operation');
      operations.push({
        profiles: profilesFor(file),
        file,
        method: node.name.text,
        owner: locate(owner),
        operation: locate(node),
        expressionSha256: hash(node.getText(unit)),
      });
    }
    ts.forEachChild(node, child => walk(child, owner));
  }
  walk(unit, undefined);
  return operations;
}
export function deriveCompiledContextRequirements(source, candidateRoot, compiled) {
  if (
    source.sourceBindingAuthenticated !== true ||
    source.failures.length ||
    !same(source.bookends.before, source.bookends.after) ||
    !same(compiled.strictSourceDerivation, source.derivations.strictObservation)
  )
    fail('authenticated finite source laws');
  // Literal data read from this authenticated module's own producer, never candidateRoot.
  const contractFile = 'scripts/ci/db-access-m4-compiled-contract.json';
  const descriptor = PROVIDER_UNIT_POLICY.producerFiles[contractFile];
  if (!Object.isFrozen(PROVIDER_UNIT_POLICY) || !descriptor || !Object.isFrozen(descriptor))
    fail('frozen producer contract descriptor');
  const fixed = JSON.parse(
    exact(fileURLToPath(new URL('../../', import.meta.url)), contractFile, descriptor)
  );
  if (compiled.sourceDerivation.contractSha256 !== digest(fixed))
    fail('authenticated finite source laws');
  const operations = TRUSTED_FILES.flatMap(file => {
    if (!source.files.includes(file) || !source.sourceRecords[file])
      fail('required trusted source');
    return extractCompiledTrustedOperations(
      file,
      exact(candidateRoot, file, source.sourceRecords[file]).toString('utf8')
    );
  });
  if (!operations.length) fail('nonempty required trusted operations');
  if (
    !same(
      compiled.sourceDerivation.vendorCorrespondence,
      fixed.vendorCorrespondence.map(row => ({
        ...row,
        candidateDescriptor: fixed.candidateFiles[row.candidate],
        producerDescriptor: fixed.projectFiles[row.producer],
      }))
    )
  )
    fail('actual compiled vendor-to-TS descriptor relation');
  const vendor = fixed.vendorCorrespondence.map(row => {
    if (row.producer !== 'scripts/ci/m4-compiled-fixture/project/vendor/' + row.candidate)
      fail('literal action/vendor path correspondence');
    const candidate = fixed.candidateFiles[row.candidate],
      producer = fixed.projectFiles[row.producer];
    if (
      !candidate ||
      !producer ||
      candidate.sha256 !== producer.sha256 ||
      candidate.bytes !== producer.bytes ||
      source.sourceRecords[row.candidate]?.sha256 !== candidate.sha256
    )
      fail('exact vendor/current source correspondence');
    return { ...row, sha256: candidate.sha256, bytes: candidate.bytes };
  });
  if (vendor.length !== 8 || new Set(vendor.map(row => row.candidate)).size !== vendor.length)
    fail('fixed nonempty preserved vendor set');
  const executedSources = new Set([
    ...TRUSTED_FILES,
    ...Object.keys(source.derivations.strictObservation.sourceRecords),
    ...source.derivations.mountedAssignment.sourceRecords
      .filter(row => row.executionRequired)
      .map(row => row.file),
  ]);
  return {
    operations,
    vendor,
    executedSources: [...executedSources].map(file => ({ file, ...source.sourceRecords[file] })),
    nextSourceInputs: Object.fromEntries([
      [
        'app/actions.js',
        fixed.projectFiles['scripts/ci/m4-compiled-fixture/project/app/actions.js'],
      ],
      ...fixed.vendorCorrespondence.map(row => [
        row.producer.slice('scripts/ci/m4-compiled-fixture/project/'.length),
        fixed.projectFiles[row.producer],
      ]),
    ]),
    sourcePolicyDigest: source.policyDigest,
    sourceBookends: source.bookends,
    originalAndCurrentDisposition:
      'original live mounts preserved; qualification counterparts separately source-bound',
  };
}
