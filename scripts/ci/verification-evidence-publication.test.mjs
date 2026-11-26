import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { approved, evidenceFixture, now } from './verification-evidence-test-fixture.mjs';
import { observe, stampFixture, verifier } from './verification-evidence-dispatch.test-support.mjs';
import {
  captureInvocation,
  checkMacJob,
  readInvocation,
  writeInvocation,
} from './verification-evidence/m4-dispatch.mjs';
import { verifyComposition } from './verification-evidence/m4.mjs';
import { finalRecordPath, LANES } from './verify-machine-records.mjs';

test('publication requires a successful terminal event for the bound M4 dispatcher job', () => {
  const macJobId = '0-0000000000000000001-1234';
  checkMacJob('finish', { macJobId, dispatcherExit: 0 });
  for (const bad of [{}, { macJobId: '1-0000000000000000001-1234', dispatcherExit: 0 }]) {
    assert.throws(() => checkMacJob('finish', bad), /mac-job-identity/u);
  }
  for (const dispatcherExit of [undefined, '0', 1, 143]) {
    assert.throws(() => checkMacJob('finish', { macJobId, dispatcherExit }), /mac-job-finish/u);
  }
});

function stamps(t, f, scope) {
  const h = stampFixture(t, f, scope);
  assert.equal(h.run('begin', 'pr-verify', now), 0);
  assert.equal(h.run('begin', 'security-guard', now + 1), 0);
  assert.equal(h.run('stamp', 'security-guard', now + 9), 0);
  assert.equal(h.run('stamp', 'pr-verify', now + 10), 0);
  const { grant, directory } = h;
  const files = LANES.map(lane => {
    const file = finalRecordPath(directory, { lane, head: scope.head, runId: grant.runIds[lane] });
    return { file, record: JSON.parse(readFileSync(file)) };
  });
  return { ...h, files, outcome: observe(grant, h.output.log, 0) };
}

test('publication requires the exact pair captured after the observed invocation exit', t => {
  const f = evidenceFixture(t);
  const scope = verifyComposition('/root', f.dir, f.job, 'dispatch', 'gate', verifier(f));
  const observed = stamps(t, f, scope);
  const unrelated = stamps(t, f, scope);
  const { file, record } = observed.files[1];
  const capture = (outcome = observed.outcome) =>
    captureInvocation(observed.directory, observed.grant, outcome, f.signAs);
  assert.throws(() => capture({ ...observed.outcome, exit: 1 }), /m4-launch-exit/u);
  const original = readFileSync(file);
  rmSync(file);
  assert.throws(capture, /ENOENT/u);
  for (const bad of [
    unrelated.files[1].record,
    {},
    { ...record, mode: 'PRE-CHECK' },
    { ...record, mode: 'TRIAL-EVIDENCE' },
    { ...record, composition: unrelated.grant.scope },
    { ...record, result: 'failed' },
  ]) {
    writeFileSync(file, JSON.stringify(bad));
    assert.throws(capture, /m4-record/u);
  }
  writeFileSync(file, JSON.stringify({ ...record, finishedAt: new Date(now + 11).toISOString() }));
  assert.throws(capture, /m4-run-pair/u);
  writeFileSync(
    file,
    JSON.stringify({ ...record, configuration: { node: 'changed after stamp' } })
  );
  assert.throws(capture, /m4-stamp-digest/u);
  writeFileSync(file, original);
  const lines = observed.output.log;
  for (const bad of [[], unrelated.output.log, lines.slice(0, -1), [...lines, lines.at(-1)]]) {
    assert.throws(() => capture(observe(observed.grant, bad, 0)), /m4-stamp-digest/u);
  }
  const directory = path.join(f.dir, 'captured');
  writeInvocation(directory, capture());
  const read = () => readInvocation(directory, scope, f.job, approved, now, f.authenticate);
  const expected = read();
  assert.throws(
    () =>
      readInvocation(
        directory,
        { ...scope, macJobId: 'other-job' },
        f.job,
        approved,
        now,
        f.authenticate
      ),
    /m4-capture-scope/u
  );
  assert.deepEqual(
    expected.value.records.map(item => item.runId),
    [observed.grant.runIds['pr-verify'], observed.grant.runIds['security-guard']]
  );
  const published = path.join(f.dir, 'published');
  writeInvocation(published, expected);
  assert.deepEqual(
    readInvocation(published, scope, f.job, approved, now, f.authenticate).bytes,
    expected.bytes
  );
  const security = path.join(directory, path.basename(file));
  writeFileSync(
    security,
    JSON.stringify({ ...record, finishedAt: new Date(now + 8).toISOString() })
  );
  assert.throws(read, /m4-capture-pair/u);
  writeFileSync(security, original);
  const index = path.join(directory, 'accepted.json');
  rmSync(index);
  assert.throws(read, /ENOENT/u);
  for (const bad of ['', '{', '{}']) {
    writeFileSync(index, bad);
    writeFileSync(path.join(directory, 'accepted.sig'), f.signAs(bad, 'm4'));
    assert.throws(read, /artifact-file|m4-capture|JSON/u);
  }
  writeFileSync(index, JSON.stringify({ ...expected.value, records: [] }));
  assert.throws(read, /signature mismatch/u);
});

test('trial captures can be retained but never accepted for publication', t => {
  const f = evidenceFixture(t);
  const scope = verifyComposition('/root', f.dir, f.job, 'dispatch', 'gate', verifier(f));
  const trial = { ...scope, method: 'composed-trial' };
  const { grant, directory: records, outcome } = stamps(t, f, trial);
  const directory = path.join(f.dir, 'trial-capture');
  writeInvocation(directory, captureInvocation(records, grant, outcome, f.signAs));
  assert.throws(
    () =>
      readInvocation(directory, trial, f.job, { ...approved, mode: 'trial' }, now, f.authenticate),
    /m4-capture-scope/u
  );
});
