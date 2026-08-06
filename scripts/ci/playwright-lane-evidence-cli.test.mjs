import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runCli } from './playwright-lane-evidence.mjs';
import { encode, expectedSummary, HEAD } from './playwright-lane-evidence-fixtures.mjs';

const cliArgs = () => [
  '--report=apps/web/test-results/pr-gate/report.json',
  `--head=${HEAD}`,
  '--lane=pr-gate',
  '--out=tmp/verification-evidence/pr-gate.json',
];

test('CLI validates arguments and paths, then writes exact canonical bytes', () => {
  const reportPath = '/repo/apps/web/test-results/pr-gate/report.json';
  const outputPath = '/repo/tmp/verification-evidence/pr-gate.json';
  const reportBytes = encode();
  const writes = [];
  const io = {
    repoRoot: '/repo',
    readFileSync(filePath) {
      if (filePath !== reportPath) {
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      return reportBytes;
    },
    realpathSync: filePath => filePath,
    mkdirSync() {},
    writeFileSync: (filePath, data, options) => writes.push([filePath, data, options]),
  };
  const args = cliArgs();
  runCli(args, io);
  assert.deepEqual(writes, [
    [
      outputPath,
      `${JSON.stringify(expectedSummary(reportBytes), null, 2)}\n`,
      { flag: 'wx', mode: 0o600 },
    ],
  ]);

  for (const invalidArgs of [
    args.slice(1),
    [...args, '--lane=pr-gate'],
    [...args, '--unknown=value'],
    args.map(arg => (arg.startsWith('--report=') ? '--report=../outside.json' : arg)),
    args.map(arg => (arg.startsWith('--report=') ? '--report=apps/web//report.json' : arg)),
    args.map(arg => (arg.startsWith('--out=') ? '--out=tmp/outside.json' : arg)),
    args.map(arg =>
      arg.startsWith('--out=') ? '--out=tmp/./verification-evidence/out.json' : arg
    ),
  ]) {
    assert.throws(() => runCli(invalidArgs, io));
  }
  assert.throws(
    () =>
      runCli(args, {
        ...io,
        readFileSync: () => {
          throw Object.assign(new Error('missing'), { code: 'ENOENT' });
        },
      }),
    /REPORT_MISSING/u
  );
  assert.throws(
    () => runCli(args, { ...io, readFileSync: () => Buffer.from('{') }),
    /REPORT_JSON_INVALID/u
  );
  assert.throws(
    () =>
      runCli(args, {
        ...io,
        realpathSync: filePath => (filePath === reportPath ? '/outside/report.json' : filePath),
      }),
    /REPORT_PATH_OUTSIDE/u
  );
  assert.throws(
    () =>
      runCli(args, {
        ...io,
        realpathSync: filePath =>
          filePath === '/repo/tmp/verification-evidence' ? '/outside/evidence' : filePath,
      }),
    /OUTPUT_PATH_OUTSIDE/u
  );
});

test('CLI refuses existing regular and symlink evidence destinations without mutation', t => {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'playwright-evidence-'));
  t.after(() => rmSync(tempRoot, { recursive: true, force: true }));
  for (const kind of ['symlink', 'regular']) {
    const repoRoot = path.join(tempRoot, kind);
    const reportPath = path.join(repoRoot, 'apps/web/test-results/pr-gate/report.json');
    const outputPath = path.join(repoRoot, 'tmp/verification-evidence/pr-gate.json');
    mkdirSync(path.dirname(reportPath), { recursive: true });
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(reportPath, encode());
    const target = kind === 'regular' ? outputPath : path.join(tempRoot, 'outside.json');
    writeFileSync(target, 'sentinel');
    if (kind === 'symlink') symlinkSync(target, outputPath);
    let error = null;
    try {
      runCli(cliArgs(), { repoRoot });
    } catch (caught) {
      error = caught.message;
    }
    assert.deepEqual(
      { kind, error, content: readFileSync(target, 'utf8') },
      { kind, error: 'OUTPUT_EXISTS', content: 'sentinel' }
    );
  }
});
