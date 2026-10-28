import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { exact } from './db-access-provider-runtime-identity.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const location = new URL('./db-access-claim-history-policy.json', import.meta.url);
const stat = fs.lstatSync(location),
  bytes = fs.readFileSync(location);
if (
  !stat.isFile() ||
  stat.isSymbolicLink() ||
  stat.mode & 0o111 ||
  hash(bytes) !== '48188adbc7e383f03de2a24846ee591716c70a516784e89acb41d76250cfb96a'
)
  throw new Error('incomplete: fixed claim-history correspondence policy source mismatch');
const policy = JSON.parse(bytes);
const SCOPED = 'existing scoped executable controls changed; root epoch cannot certify equivalence';
const publicRow = row =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')));
const demand = (condition, reason) => {
  if (!condition) throw new Error(reason);
};
const snapshot = sources =>
  hash(
    JSON.stringify(
      [...sources]
        .map(([file, text]) => [file, hash(text)])
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    )
  );

// The evaluator passes only its original native inventory of authenticated ADOPTION.
export function captureClaimHistoryPriorRow(entries, analysisUnknown) {
  if (analysisUnknown.size) return undefined;
  const matches = entries.filter(row => row.file === policy.file);
  return matches.length === 1 ? publicRow(matches[0]) : undefined;
}

// One exact local nonexpansion proof. No caller, graph/handle diagnostic or runtime credit.
// The two closed private parsers return identical valid scalar values or abort before values;
// fixed per-schema errors never inspect invalid input prototypes or global error callbacks.
export function classifyClaimHistoryCorrespondence(prepared, graph, failures, priorRow) {
  const result = { id: policy.id, operations: [], runtimeAdmission: false };
  if (
    prepared.adoption.commit !== policy.adoptionCommit ||
    prepared.adoption.tree !== policy.adoptionTree
  )
    return { ...result, status: 'not-applicable' };
  try {
    demand(
      prepared.baseline.entries.length === 604 &&
        hash(prepared.baselineBytes) === policy.baselineSha256,
      'historical baseline changed'
    );
    demand(
      prepared.sources instanceof Map &&
        snapshot(prepared.sources) === policy.currentSourceSnapshotSha256,
      'current application source snapshot changed'
    );
    demand(
      hash(prepared.sources.get(policy.file) ?? '') === policy.currentSourceSha256 &&
        hash(prepared.trusted.get(policy.file) ?? '') === policy.adoptionSourceSha256 &&
        !prepared.providerFiles.has(policy.file),
      'history source or provider boundary changed'
    );
    for (const [file, expected] of Object.entries(policy.fixedFiles))
      exact(prepared.repoRoot, file, { mode: '100644', ...expected });
    demand(
      isDeepStrictEqual(priorRow, policy.priorRow),
      'native prior scoped history row changed or absent'
    );
    const rows = prepared.inventory.entries.filter(row => row.file === policy.file).map(publicRow);
    demand(
      rows.length === 1 && isDeepStrictEqual(rows[0], policy.currentRow),
      'current history inventory changed'
    );
    demand(
      !graph.failures.some(row => row.file === policy.file),
      'history changed-edge failure remains'
    );
    const currentFailure = failures.get(policy.currentRow.identity);
    demand(
      currentFailure &&
        isDeepStrictEqual(publicRow(currentFailure), { ...policy.currentRow, reason: SCOPED }),
      'current scoped history failure changed or absent'
    );
    const contract = prepared.providerUnit?.crmProof,
      runtime = prepared.providerPolicy?.runtimeEnforcement;
    demand(
      contract?.runtimeRequired === true &&
        contract.acceptedReceiptInputs === false &&
        contract.runtimeAdmission === false &&
        runtime?.mode === 'required-direct-execution' &&
        runtime.acceptedReceiptInputs === false,
      'mandatory direct runtime execution absent'
    );
    demand(
      contract.sources[policy.file]?.sha256 === policy.currentSourceSha256 &&
        contract.runtime.files[policy.file]?.sha256 === policy.currentSourceSha256 &&
        contract.runtime.expectedInputs.includes(policy.file),
      'actual history runtime input not source-bound'
    );
    // Commit once, only after the full fixed source/native-row/runtime bundle matched.
    failures.delete(policy.currentRow.identity);
    return {
      ...result,
      status: 'classified',
      kind: 'preserved-local-scope-nonexpansion',
      operations: [
        {
          identity: policy.currentRow.identity,
          priorIdentity: policy.priorRow.identity,
          file: policy.file,
        },
      ],
      graphDiagnosticsDischarged: 0,
    };
  } catch (error) {
    return {
      ...result,
      status: 'held',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
