import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { writeGuardReport } from './db-access-report.mjs';

const adoption = {
  commit: 'a'.repeat(40),
  tree: 'b'.repeat(40),
};

function temporaryOutput(name) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'db-access-report-'));
  test.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return path.join(directory, name);
}

test('streamed guard report preserves JSON.stringify schema, order and formatting', () => {
  const output = temporaryOutput('report.json');
  const report = {
    status: 'fail',
    trustedCommit: adoption.commit,
    trustedTree: adoption.tree,
    counts: { byTenantPosture: { unclassified: 2, 'tenant-context': 1 } },
    newEntries: [{ file: 'apps/web/src/a.ts', line: 2, mountedFromAll: ['one', 'two'] }, null],
    incomplete: [],
    finite: 3,
    nonFinite: Number.POSITIVE_INFINITY,
  };

  const written = writeGuardReport(output, report, adoption);

  assert.strictEqual(written, report);
  assert.equal(fs.readFileSync(output, 'utf8'), `${JSON.stringify(report, null, 2)}\n`);
});

test('streamed guard report completes short byte writes without splitting UTF-8', () => {
  const output = temporaryOutput('short-writes.json');
  const report = {
    status: 'pass',
    labels: ['Shënim për anëtarin', 'доказ', '🛡️'],
    nested: { çështja: 'përfunduar' },
  };
  const originalWrite = fs.writeSync;
  fs.writeSync = (descriptor, bytes, offset, length, position) =>
    originalWrite(descriptor, bytes, offset, Math.min(length, 1), position);
  try {
    assert.strictEqual(writeGuardReport(output, report, adoption), report);
  } finally {
    fs.writeSync = originalWrite;
  }

  assert.equal(fs.readFileSync(output, 'utf8'), `${JSON.stringify(report, null, 2)}\n`);
});

test('a write with no progress cannot return a passing report', () => {
  const output = temporaryOutput('stalled-write.json');
  fs.writeFileSync(output, '{"status":"fail"}\n');
  const originalWrite = fs.writeSync;
  fs.writeSync = () => 0;
  try {
    assert.throws(
      () => writeGuardReport(output, { status: 'pass' }, adoption),
      /incomplete: report write failed:.*no valid progress/u
    );
  } finally {
    fs.writeSync = originalWrite;
  }
  assert.equal(fs.readFileSync(output, 'utf8'), '{"status":"fail"}\n');
  assert.equal(
    fs.readdirSync(path.dirname(output)).filter(file => file.includes('.tmp-')).length,
    0
  );
});

test('serialization defects replace stale output with an explicit incomplete report', () => {
  const output = temporaryOutput('report.json');
  fs.writeFileSync(output, '{"status":"pass"}\n');

  const written = writeGuardReport(
    output,
    { status: 'pass', unsupported: 1n, failingNewEntries: [] },
    adoption
  );
  const persisted = JSON.parse(fs.readFileSync(output, 'utf8'));

  assert.equal(written.status, 'incomplete');
  assert.deepEqual(persisted, written);
  assert.equal(persisted.trustedCommit, adoption.commit);
  assert.equal(persisted.trustedTree, adoption.tree);
  assert.deepEqual(persisted.failingNewEntries, []);
  assert.match(persisted.incomplete[0].reason, /^incomplete: report serialization failed:/u);
  assert.equal(
    fs.readdirSync(path.dirname(output)).filter(file => file.includes('.tmp-')).length,
    0
  );
});

test('streamed guard report completes under a heap smaller than its output', () => {
  const output = temporaryOutput('large-report.json');
  const moduleUrl = pathToFileURL(path.join(import.meta.dirname, 'db-access-report.mjs')).href;
  const script = [
    `import { writeGuardReport } from ${JSON.stringify(moduleUrl)};`,
    `const output = ${JSON.stringify(output)};`,
    "const payload = 'x'.repeat(1024);",
    'const values = new Array(48 * 1024).fill(payload);',
    `writeGuardReport(output, { status: 'pass', values }, ${JSON.stringify(adoption)});`,
  ].join('\n');

  const result = spawnSync(
    process.execPath,
    ['--max-old-space-size=24', '--input-type=module', '-e', script],
    {
      encoding: 'utf8',
      timeout: 30_000,
    }
  );

  assert.equal(result.status, 0, result.stderr);
  assert.ok(fs.statSync(output).size > 48 * 1024 * 1024);
  const descriptor = fs.openSync(output, 'r');
  try {
    const start = Buffer.alloc(1);
    const end = Buffer.alloc(2);
    fs.readSync(descriptor, start, 0, 1, 0);
    fs.readSync(descriptor, end, 0, 2, fs.statSync(output).size - 2);
    assert.equal(start.toString(), '{');
    assert.equal(end.toString(), '}\n');
  } finally {
    fs.closeSync(descriptor);
  }
});
