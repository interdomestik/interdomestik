import fs from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifyStatusReturnEquivalence } from './db-access-status-return-equivalence.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = process.env.STATUS_RETURN_TEST_REPO ?? path.resolve(here, '../..');
const policy = JSON.parse(
  fs.readFileSync(path.join(here, 'db-access-status-return-equivalence-policy.json'))
);
policy.files = [
  ...JSON.parse(fs.readFileSync(path.join(here, 'db-access-status-return-sources-1.json'))),
  ...JSON.parse(fs.readFileSync(path.join(here, 'db-access-status-return-sources-2.json'))),
];
policy.dependencies = JSON.parse(
  fs.readFileSync(path.join(here, 'db-access-status-return-dependencies.json'))
);
const { PROVIDER_UNIT_POLICY } = await import(
  pathToFileURL(path.join(repo, 'scripts/ci/db-access-provider-unit-policy.mjs'))
);
const clone = value => structuredClone(value);
// Fixed unit inputs model the already-reviewed contract, independently of the active checkout.
// Native current-source classification still uses the real prepared model and remains fail closed.
const fixtureCommit = '28ae8c3741bfcdbaaac5fb13076a23a45e8ec3d1';
function fixedSources(commit, identities) {
  const names = [...identities.keys()].sort();
  const raw = execFileSync('git', ['cat-file', '--batch'], {
    cwd: repo,
    input: names.map(file => commit + ':' + file + '\n').join(''),
    maxBuffer: 64 * 1024 * 1024,
  });
  const result = new Map();
  let offset = 0;
  for (const file of names) {
    const end = raw.indexOf(10, offset);
    const header = raw.subarray(offset, end).toString();
    const match = /^([a-f0-9]{40}) blob ([0-9]+)$/u.exec(header);
    if (!match) throw new Error('Missing fixed status-return unit source: ' + file);
    const size = Number(match[2]);
    const bytes = raw.subarray(end + 1, end + 1 + size);
    if (
      bytes.length !== size ||
      createHash('sha256').update(bytes).digest('hex') !== identities.get(file)
    )
      throw new Error('Changed fixed status-return unit source: ' + file);
    result.set(file, bytes.toString('utf8'));
    offset = end + 1 + size + 1;
  }
  if (offset !== raw.length) throw new Error('Unexpected fixed unit source batch trailer');
  return result;
}
const currentIdentities = new Map(policy.files.map(item => [item.file, item.currentSha256]));
for (const [file, hash] of Object.entries(policy.providerSources))
  currentIdentities.set(file, hash);
const sources = fixedSources(fixtureCommit, currentIdentities);
const trusted = fixedSources(
  policy.adoptionCommit,
  new Map(
    policy.files
      .filter(item => item.adoptionSha256 !== null)
      .map(item => [item.file, item.adoptionSha256])
  )
);
const baselineBytes = fs.readFileSync(path.join(repo, 'scripts/ci/db-access-baseline.json'));
function fixture({ futureRuntimeContract = true, original = PROVIDER_UNIT_POLICY.crmProof } = {}) {
  const contract = {
    runtimeRequired: original.runtimeRequired,
    acceptedReceiptInputs: original.acceptedReceiptInputs,
    runtimeAdmission: original.runtimeAdmission,
    cases: clone(original.cases),
    runtime: clone(original.runtime),
    sources: clone(original.sources),
  };
  // Unit fixtures explicitly model both contracts before and after owner integration.
  contract.cases = contract.cases.filter(item => item.id !== policy.runtime.caseId);
  contract.runtime.requiredCases = contract.runtime.requiredCases.filter(
    id => id !== policy.runtime.caseId
  );
  if (futureRuntimeContract) {
    contract.cases.push({
      id: policy.runtime.caseId,
      kind: 'runtime',
      files: clone(policy.runtime.files),
      requiredAssertions: clone(policy.runtime.requiredAssertions),
      justification: 'Unit fixture only; no executed runtime claim.',
    });
    contract.runtime.requiredCases.push(policy.runtime.caseId);
    for (const file of policy.runtime.files) {
      const item = policy.files.find(entry => entry.file === file);
      contract.sources[file] = {
        sha256: item.currentSha256,
        bytes: Buffer.byteLength(sources.get(file)),
        mode: '100644',
      };
      if (!contract.runtime.expectedInputs.includes(file))
        contract.runtime.expectedInputs.push(file);
    }
  }
  const prepared = {
    adoption: { commit: policy.adoptionCommit, tree: policy.adoptionTree },
    baselineBytes,
    baseline: JSON.parse(baselineBytes),
    sources: new Map(sources),
    trusted: new Map(trusted),
    providerFiles: new Set(policy.providerFiles),
    providerPolicy: {
      runtimeEnforcement: clone(PROVIDER_UNIT_POLICY.runtimeEnforcement),
    },
    providerUnit: { crmProof: contract },
    moduleTargets: {
      dependencies: new Map(policy.dependencies.map(([file, targets]) => [file, new Set(targets)])),
    },
    inventory: {
      entries: clone(policy.inventory),
      changed: new Set(policy.mounts),
    },
  };
  const graph = {
    failures: policy.mounts.map(mountedFrom => ({
      ...clone(policy.currentRow),
      mountedFrom,
    })),
    incomplete: [
      {
        file: 'unrelated.ts',
        reason: 'unresolved UNKNOWN remains held',
        occurrences: 3,
      },
    ],
  };
  const failures = new Map(
    policy.inventory
      .filter(row => row.file === policy.currentRow.file)
      .map(row => [
        row.identity,
        {
          ...clone(row),
          reason:
            'existing scoped executable controls changed; root epoch cannot certify equivalence',
        },
      ])
  );
  failures.set('other-runtime-obligation', {
    identity: 'other-runtime-obligation',
    reason: 'new SQL runtime proof remains required',
  });
  return { prepared, graph, failures, priorRow: clone(policy.priorRow) };
}
const run = f => classifyStatusReturnEquivalence(f.prepared, f.graph, f.failures, f.priorRow);

export { clone, fixture, policy, run };
