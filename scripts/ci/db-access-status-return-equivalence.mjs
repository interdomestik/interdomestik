import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fixedPart(name, expected) {
  const location = new URL(name, import.meta.url);
  const stat = fs.lstatSync(location);
  const bytes = fs.readFileSync(location);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (stat.mode & 0o111) !== 0 ||
    digest(bytes) !== expected
  )
    throw new Error('incomplete: fixed status-return equivalence policy source mismatch');
  return JSON.parse(bytes);
}
const policy = {
  ...fixedPart(
    './db-access-status-return-equivalence-policy.json',
    '2d83f860315dd9c2d62f554c51cf175db5d4b7edfd69f4caa319e371f16fe08c'
  ),
  files: [
    ...fixedPart(
      './db-access-status-return-sources-1.json',
      '20eaf97ab21be0d2430d57b2b41504f468bc0e2b8eea76723775104b61c14fb1'
    ),
    ...fixedPart(
      './db-access-status-return-sources-2.json',
      '01ce357866a017c712cd40d6fb6adce2a1a5ebbc6af3426d1175f88a05168844'
    ),
  ],
  dependencies: fixedPart(
    './db-access-status-return-dependencies.json',
    'b95b5b5e5098b39938ba78c902a8856f35c3677cd1ddefef1443f0a4e6d46b6f'
  ),
};
const SCOPED = 'existing scoped executable controls changed; root epoch cannot certify equivalence';
const publicRow = row =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')));
const sameSet = (actual, expected) =>
  actual.length === expected.length &&
  new Set(actual).size === actual.length &&
  actual.every(value => expected.includes(value));
const sortedRows = rows =>
  rows
    .map(publicRow)
    .sort((left, right) =>
      left.identity < right.identity ? -1 : left.identity > right.identity ? 1 : 0
    );
const demand = (condition, message) => {
  if (!condition) throw new Error(message);
};

// Called only on the native CURRENT-engine inventory of the authenticated ADOPTION model.
// Keep one public observation; do not retain that model or recompute/relabel its classification.
export function captureStatusReturnPriorRow(entries) {
  const matches = entries.filter(row => row.identity === policy.priorRow.identity);
  return matches.length === 1 ? publicRow(matches[0]) : undefined;
}

function checkSources(prepared) {
  demand(digest(prepared.baselineBytes) === policy.baselineSha256, 'historical baseline changed');
  demand(prepared.baseline.entries.length === 604, 'historical baseline count changed');
  demand(sameSet([...prepared.providerFiles], policy.providerFiles), 'provider boundary changed');
  for (const expected of policy.files) {
    const current = prepared.sources.get(expected.file);
    const prior = prepared.trusted.get(expected.file);
    demand(
      typeof current === 'string' &&
        digest(current) === expected.currentSha256 &&
        (prior === undefined ? null : digest(prior)) === expected.adoptionSha256 &&
        prepared.providerFiles.has(expected.file) === expected.providerBoundary,
      'source binding changed: ' + expected.file
    );
  }
  for (const [file, expected] of Object.entries(policy.providerSources))
    demand(
      typeof prepared.sources.get(file) === 'string' &&
        digest(prepared.sources.get(file)) === expected,
      'provider implementation changed: ' + file
    );
  for (const [file, expected] of policy.dependencies) {
    const actual = prepared.moduleTargets.dependencies.get(file);
    demand(actual && sameSet([...actual], expected), 'dependency targets changed: ' + file);
  }
  const reached = new Set(policy.mounts),
    queue = [...policy.mounts],
    cuts = new Set();
  for (const file of queue)
    for (const target of prepared.moduleTargets.dependencies.get(file) ?? []) {
      if (!prepared.providerFiles.has(file) && prepared.providerFiles.has(target)) {
        cuts.add(JSON.stringify([file, target]));
        continue;
      }
      if (!reached.has(target)) {
        reached.add(target);
        queue.push(target);
      }
    }
  demand(
    sameSet(
      [...reached],
      policy.files.map(item => item.file)
    ),
    'source closure changed'
  );
  demand(
    sameSet(
      [...cuts],
      policy.providerBoundaryCuts.map(edge => JSON.stringify(edge))
    ),
    'provider cut edges changed'
  );
}

function checkRuntimeObligation(prepared) {
  const contract = prepared.providerUnit?.crmProof;
  const enforcement = prepared.providerPolicy?.runtimeEnforcement;
  demand(
    contract?.runtimeRequired === true &&
      contract.acceptedReceiptInputs === false &&
      contract.runtimeAdmission === false &&
      enforcement?.mode === 'required-direct-execution' &&
      enforcement.acceptedReceiptInputs === false,
    'mandatory direct runtime execution absent'
  );
  const cases = contract.cases.filter(item => item.id === policy.runtime.caseId);
  demand(cases.length === 1 && cases[0].kind === 'runtime', 'notification runtime case missing');
  const item = cases[0];
  demand(sameSet(item.files, policy.runtime.files), 'notification runtime source coverage changed');
  demand(
    sameSet(item.requiredAssertions, policy.runtime.requiredAssertions),
    'notification runtime assertions changed'
  );
  demand(
    contract.runtime.requiredCases.filter(id => id === item.id).length === 1,
    'notification runtime case is not mandatory'
  );
  for (const file of item.files) {
    const source = prepared.sources.get(file);
    demand(
      typeof source === 'string' &&
        contract.sources[file]?.sha256 === digest(source) &&
        contract.runtime.expectedInputs.includes(file),
      'notification runtime input not source-bound: ' + file
    );
  }
}

// One fixed old/current correspondence. Native handle answers, inventories, debt flags,
// graph diagnostics and every other failure remain untouched. This never issues runtime credit.
export function classifyStatusReturnEquivalence(prepared, graph, failures, priorRow) {
  const result = { id: policy.id, operations: [], runtimeAdmission: false };
  if (
    prepared.adoption.commit !== policy.adoptionCommit ||
    prepared.adoption.tree !== policy.adoptionTree
  )
    return { ...result, status: 'not-applicable' };
  try {
    checkSources(prepared);
    demand(isDeepStrictEqual(priorRow, policy.priorRow), 'native prior debt row changed or absent');
    const selected = prepared.inventory.entries.filter(row =>
      policy.inventoryFiles.includes(row.file)
    );
    demand(
      isDeepStrictEqual(sortedRows(selected), sortedRows(policy.inventory)),
      'operation inventory changed'
    );
    const expectedFailure = { ...policy.currentRow, reason: SCOPED };
    const failure = failures.get(policy.currentRow.identity);
    demand(
      failure && isDeepStrictEqual(publicRow(failure), expectedFailure),
      'scoped failure changed or absent'
    );
    const observedMounts = new Set();
    for (const row of graph.failures.filter(item => item.identity === policy.currentRow.identity)) {
      const { mountedFrom, ...entry } = publicRow(row);
      demand(
        isDeepStrictEqual(entry, policy.currentRow),
        'mounted operation classification changed'
      );
      observedMounts.add(mountedFrom);
    }
    demand(sameSet([...observedMounts], policy.mounts), 'operation mount set changed');
    checkRuntimeObligation(prepared);
    // Commit only after the entire source/debt/mount/runtime-contract bundle matched.
    failures.delete(policy.currentRow.identity);
    return {
      ...result,
      status: 'classified',
      kind: 'preserved-debt-source-correspondence',
      operations: [
        {
          identity: policy.currentRow.identity,
          priorIdentity: policy.priorRow.identity,
        },
      ],
      requiredRuntimeCases: [policy.runtime.caseId],
    };
  } catch (error) {
    return {
      ...result,
      status: 'held',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
