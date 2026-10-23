import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hash } from './db-access-provider-runtime-identity.mjs';
import { crmDigest } from './db-access-crm-proof-shape.mjs';
import { encodeDiagnostics } from './db-access-crm-diagnostic-encoding-fixture.mjs';
import { loadCrmProofPolicy } from './db-access-crm-policy-loader.mjs';

export function logicalFixture() {
  const operation = {
    identity: 'operation',
    file: 'fixture.ts',
    line: 1,
    method: 'select',
    callee: 'tx.select',
    reason: 'fixed',
  };
  const diagnostic = { file: 'fixture.ts', reason: 'fixed', occurrences: 1 };
  const mountEvidence = {
    version: 1,
    analysisIncomplete: true,
    roots: [{ file: 'fixture.ts' }],
    operations: [{ identity: 'operation', roots: ['fixture.ts'] }],
  };
  const contract = {
    id: 's8-crm-integration-proof-v1',
    version: 1,
    baselineCount: 604,
    runtimeRequired: true,
    acceptedReceiptInputs: false,
    runtimeAdmission: false,
    sources: { 'fixture.ts': { sha256: 'a'.repeat(64), bytes: 1, mode: '100644' } },
    edges: {},
    inventory: { scannedCount: 1, newCount: 1, newEntriesDigest: crmDigest([operation]) },
    witnesses: {
      mountEvidence,
      operations: [{ ...operation, productionOperation: true, caseIds: ['crm-fixture'] }],
      diagnostics: [{ ...diagnostic, caseIds: ['crm-fixture'] }],
    },
    cases: [
      {
        id: 'crm-fixture',
        kind: 'runtime',
        files: ['fixture.ts'],
        justification: 'Synthetic equality case, not an executed runtime proof',
        requiredAssertions: ['own-row', 'foreign-denied'],
      },
    ],
    runtime: { requiredCases: ['crm-fixture'] },
  };
  const observed = () => ({
    failures: new Map([[operation.identity, structuredClone(operation)]]),
    incomplete: [structuredClone(diagnostic)],
    mountEvidence: structuredClone(mountEvidence),
    newEntries: [structuredClone(operation)],
    scannedCount: 1,
    baselineCount: 604,
  });
  return { contract, observed };
}

export function materializeContract(t, input, compact, options = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crm-equality-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const contract = structuredClone(input),
    policy = { producerFiles: {} };
  const mount = contract.witnesses.mountEvidence;
  const values = ['sources', 'edges', 'cases'].map(kind => ({ kind, value: contract[kind] }));
  values.push({ kind: 'operations', value: contract.witnesses.operations });
  if (compact)
    values.push(
      ...encodeDiagnostics(contract.witnesses.diagnostics),
      { kind: 'mount-roots', value: { offset: 0, items: mount.roots } },
      { kind: 'mount-operations', value: { offset: 0, items: mount.operations } }
    );
  else values.push({ kind: 'diagnostics', value: contract.witnesses.diagnostics });
  for (const key of ['sources', 'edges', 'cases']) delete contract[key];
  delete contract.witnesses.operations;
  delete contract.witnesses.diagnostics;
  const index = { shards: [], contract };
  if (compact) {
    index.wireVersion = 1;
    index.mountEncoding = {
      version: 1,
      rootCount: mount.roots.length,
      operationCount: mount.operations.length,
      expandedDigest: crmDigest(mount),
    };
    contract.witnesses.mountEvidence = {
      version: mount.version,
      analysisIncomplete: mount.analysisIncomplete,
    };
  }
  while (values.length < (options.shards ?? 0)) values.push({ kind: 'edges', value: {} });
  const write = (file, value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.writeFileSync(path.join(root, file), bytes);
    policy.producerFiles[file] = { bytes: bytes.length, sha256: hash(bytes), mode: '100644' };
  };
  for (const [i, value] of values.entries()) {
    const file = `scripts/ci/db-access-crm-proof-data-${String(i).padStart(3, '0')}.json`;
    write(file, value);
    index.shards.push(file);
  }
  if (options.indexBytes) {
    index.contract.padding = '';
    const needed = options.indexBytes - Buffer.byteLength(JSON.stringify(index));
    if (needed < 0) throw new Error('fixture index target too small');
    index.contract.padding = 'x'.repeat(needed);
  }
  write('scripts/ci/db-access-crm-proof-policy.json', index);
  return { root, policy, index, run: () => loadCrmProofPolicy(policy, root) };
}
