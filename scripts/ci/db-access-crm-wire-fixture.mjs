import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { hash } from './db-access-provider-runtime-identity.mjs';
import { crmDigest } from './db-access-crm-proof-shape.mjs';
import { loadCrmProofPolicy } from './db-access-crm-policy-loader.mjs';
import {
  DIAGNOSTIC_ROWS,
  encodeDiagnostics,
} from './db-access-crm-diagnostic-encoding-fixture.mjs';

export const WIRE_INDEX = 'scripts/ci/db-access-crm-proof-policy.json';
export function wireFixture(t, change = {}) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'crm-wire-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const policy = { producerFiles: {} };
  const mountEvidence = {
    version: 1,
    analysisIncomplete: true,
    roots: [{ file: 'apps/a.ts' }],
    operations: [{ identity: 'one', roots: ['apps/a.ts'] }],
  };
  const sources = { kind: 'sources', value: { 'apps/a.ts': { sha256: 'a' } } };
  const compact = change.compact !== false;
  const values =
    change.values ??
    (compact
      ? [
          sources,
          ...encodeDiagnostics(DIAGNOSTIC_ROWS),
          { kind: 'mount-roots', value: { offset: 0, items: mountEvidence.roots } },
          { kind: 'mount-operations', value: { offset: 0, items: mountEvidence.operations } },
        ]
      : [sources, { kind: 'diagnostics', value: DIAGNOSTIC_ROWS }]);
  const write = (file, value) => {
    const bytes = Buffer.from(JSON.stringify(value));
    const dest = path.join(root, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, bytes);
    policy.producerFiles[file] = { sha256: hash(bytes), bytes: bytes.length, mode: '100644' };
  };
  const files = values.map((value, i) => {
    const file = `scripts/ci/db-access-crm-proof-data-${String(i).padStart(3, '0')}.json`;
    write(file, value);
    return file;
  });
  const index = { shards: files, contract: { id: 'finite', witnesses: { mountEvidence } } };
  if (compact) {
    index.wireVersion = 1;
    index.mountEncoding = {
      version: 1,
      rootCount: 1,
      operationCount: 1,
      expandedDigest: crmDigest(mountEvidence),
    };
    index.contract.witnesses.mountEvidence = { version: 1, analysisIncomplete: true };
  }
  change.mutateIndex?.(index);
  write(WIRE_INDEX, index);
  return { root, policy, files, run: () => loadCrmProofPolicy(policy, root) };
}
