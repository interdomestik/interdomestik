import fs from 'node:fs';
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
const sources = new Map(),
  trusted = new Map();
for (const item of policy.files) {
  const current = fs.readFileSync(path.join(repo, item.file), 'utf8');
  sources.set(item.file, current);
  if (item.adoptionSha256 !== null)
    trusted.set(
      item.file,
      item.adoptionSha256 === item.currentSha256
        ? current
        : execFileSync('git', ['show', policy.adoptionCommit + ':' + item.file], {
            cwd: repo,
            encoding: 'utf8',
          })
    );
}
for (const file of policy.providerFiles)
  sources.set(file, fs.readFileSync(path.join(repo, file), 'utf8'));
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
