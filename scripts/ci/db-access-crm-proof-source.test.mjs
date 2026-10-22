import assert from 'node:assert/strict';
import test from 'node:test';
import ts from 'typescript';
import { digest } from './db-access-trust.mjs';
import { CRM_CONTRACT_ID, crmDigest } from './db-access-crm-proof-shape.mjs';
import { crmProofObligations, verifyCrmProofSource } from './db-access-crm-proof-source.mjs';

const file = 'apps/web/src/crm-fixed-fixture.ts';
function fixture() {
  const source = 'export function fixedRead() { return 1; }';
  const row = {
    identity: 'a'.repeat(64),
    file,
    line: 1,
    method: 'escape',
    callee: 'db',
    reason: 'unknown',
    tenantPosture: 'unclassified',
    risk: 'app-layer',
  };
  const diagnostic = { file, reason: 'bounded analysis unresolved', occurrences: 2 };
  const mounts = {
    version: 1,
    analysisIncomplete: true,
    roots: [{ id: 0, file, changeKind: 'runtime-source' }],
    operations: [{ identity: row.identity, observedRootIds: [0] }],
  };
  const contract = {
    id: CRM_CONTRACT_ID,
    version: 1,
    baselineCount: 604,
    runtimeRequired: true,
    acceptedReceiptInputs: false,
    runtimeAdmission: false,
    sources: {
      [file]: { mode: '100644', bytes: Buffer.byteLength(source), sha256: digest(source) },
    },
    edges: { [file]: {} },
    inventory: { scannedCount: 605, newCount: 1, newEntriesDigest: crmDigest([row]) },
    witnesses: {
      operations: [{ ...row, caseIds: ['crm-real-read'], productionOperation: true }],
      diagnostics: [{ ...diagnostic, caseIds: ['crm-real-read'] }],
      mountEvidence: mounts,
    },
    cases: [
      {
        id: 'crm-real-read',
        kind: 'runtime',
        files: [file],
        justification: 'Exact tenant-bound read; real DB isolation required.',
        requiredAssertions: ['own', 'foreign-denied'],
      },
    ],
    runtime: { requiredCases: ['crm-real-read'] },
  };
  const model = {
    parsed: new Map([[file, ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)]]),
  };
  const reader = (_root, path, expected) => {
    assert.equal(path, file);
    assert.equal(expected.mode, '100644');
    assert.equal(expected.bytes, Buffer.byteLength(source));
    assert.equal(expected.sha256, digest(source));
    return source;
  };
  const context = {
    failures: new Map([[row.identity, { ...row }]]),
    incomplete: [{ ...diagnostic }],
    mountEvidence: structuredClone(mounts),
    newEntries: [{ ...row }],
    scannedCount: 605,
    baselineCount: 604,
  };
  return { contract, model, reader, context, row, diagnostic };
}
const verify = f => verifyCrmProofSource('/fixed', f.model, { crmProof: f.contract }, f.reader);
function unchangedAfterFailure(f, contract, pattern) {
  const before = [...f.context.failures];
  const diagnostics = structuredClone(f.context.incomplete);
  assert.throws(() => crmProofObligations(contract, f.context), pattern);
  assert.deepEqual([...f.context.failures], before);
  assert.deepEqual(f.context.incomplete, diagnostics);
}

test('exact authenticated witnesses become provisional obligations while original rows remain available', () => {
  const f = fixture(),
    contract = verify(f),
    original = structuredClone(f.context.newEntries);
  const result = crmProofObligations(contract, f.context);
  assert.equal(result.runtimeAdmission, false);
  assert.equal(result.operations[0].runtimeAdmission, false);
  assert.equal(result.diagnostics[0].runtimeAdmission, false);
  assert.equal(f.context.failures.size, 0);
  assert.deepEqual(result.remaining, []);
  assert.deepEqual(f.context.newEntries, original);
  assert.equal(f.context.incomplete.length, 1);
  assert.equal(result.contractDigest, crmDigest(f.contract));
  assert.ok(Object.isFrozen(contract.witnesses.operations));
});
test('a copied or forged contract cannot classify witnesses', () => {
  const f = fixture();
  verify(f);
  unchangedAfterFailure(f, structuredClone(f.contract), /unauthenticated/);
});
test('source bytes and model content must agree', () => {
  const f = fixture();
  f.model.parsed.get(file).text += ' ';
  assert.throws(() => verify(f), /model\/source mismatch/);
});
test('fixed dependency edges cannot be substituted', () => {
  const f = fixture();
  f.contract.edges[file] = { foreign: null };
  assert.throws(() => verify(f), /dependency drift/);
});
test('unbound source references fail', () => {
  const f = fixture();
  f.contract.witnesses.operations[0].file = 'apps/web/foreign.ts';
  assert.throws(() => verify(f), /unbound witness/);
});
test('missing runtime coverage fails before classification', () => {
  const f = fixture();
  f.contract.witnesses.operations[0].caseIds = ['crm-missing'];
  assert.throws(() => verify(f), /coverage/);
});
test('production DB operations cannot use data-only source classifications', () => {
  const f = fixture();
  f.contract.cases[0].kind = 'source-classification';
  assert.throws(() => verify(f), /production operation requires runtime/);
});
test('omitted mandatory runtime case fails', () => {
  const f = fixture();
  f.contract.runtime.requiredCases = [];
  assert.throws(() => verify(f), /mandatory runtime/);
});
test('duplicate operation and diagnostic identities fail', () => {
  for (const name of ['operations', 'diagnostics']) {
    const f = fixture();
    f.contract.witnesses[name].push(structuredClone(f.contract.witnesses[name][0]));
    assert.throws(() => verify(f), /duplicate/);
  }
});
test('baseline drift never becomes a runtime obligation', () => {
  const f = fixture();
  f.contract.baselineCount = 605;
  assert.throws(() => verify(f), /contract identity/);
});
test('runtime admission or receipt-input switches are refused', () => {
  for (const key of ['runtimeAdmission', 'acceptedReceiptInputs']) {
    const f = fixture();
    f.contract[key] = true;
    assert.throws(() => verify(f), /contract identity/);
  }
});
test('an extra observed root fails atomically', () => {
  const f = fixture(),
    c = verify(f);
  f.context.mountEvidence.roots.push({
    id: 1,
    file: 'apps/web/foreign.ts',
    changeKind: 'runtime-source',
  });
  unchangedAfterFailure(f, c, /root or mounted/);
});
test('a substituted mounted operation fails atomically', () => {
  const f = fixture(),
    c = verify(f);
  f.context.mountEvidence.operations[0].observedRootIds = [];
  unchangedAfterFailure(f, c, /root or mounted/);
});
test('changed inventory or added operation fails atomically', () => {
  const f = fixture(),
    c = verify(f);
  f.context.newEntries.push({ ...f.row, identity: 'b'.repeat(64) });
  unchangedAfterFailure(f, c, /inventory drift/);
});
test('operation reason drift fails without erasing the failure', () => {
  const f = fixture(),
    c = verify(f);
  f.context.failures.get(f.row.identity).reason = 'different';
  unchangedAfterFailure(f, c, /operation witness drift/);
});
test('missing failure identity fails without partial mutation', () => {
  const f = fixture(),
    c = verify(f);
  f.context.failures.clear();
  f.context.failures.set('foreign', { ...f.row, identity: 'foreign' });
  unchangedAfterFailure(f, c, /operation witness drift/);
});
test('changed diagnostic occurrence fails after operation matching but before mutation', () => {
  const f = fixture(),
    c = verify(f);
  f.context.incomplete[0].occurrences++;
  unchangedAfterFailure(f, c, /diagnostic witness/);
});
test('missing diagnostic fails without partial operation removal', () => {
  const f = fixture(),
    c = verify(f);
  f.context.incomplete = [];
  unchangedAfterFailure(f, c, /diagnostic witness/);
});
test('additional unreviewed diagnostics remain unresolved', () => {
  const f = fixture(),
    c = verify(f);
  const foreign = { file, reason: 'new unknown', occurrences: 1 };
  f.context.incomplete.push(foreign);
  const result = crmProofObligations(c, f.context);
  assert.deepEqual(result.remaining, [foreign]);
  assert.equal(result.runtimeAdmission, false);
});
test('absence of a contract grants no classification', () => {
  const f = fixture();
  const result = crmProofObligations(undefined, f.context);
  assert.equal(result.remaining, f.context.incomplete);
  assert.equal(f.context.failures.size, 1);
});

test('missing or malformed operation classification cannot default to source-only proof', () => {
  for (const value of [undefined, null, 'true', 0]) {
    const f = fixture();
    f.contract.witnesses.operations[0].productionOperation = value;
    assert.throws(() => verify(f), /explicit operation classification/);
  }
});
