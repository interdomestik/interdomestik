import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  createEmptyArgs,
  createPilotReadyTag,
  parseArgs,
  verifyPilotReadyTag,
} = require('./pilot-ready-tag.js');

const PILOT_ID = 'pilot-ks-week-1';
const FIXED_GIT_EXECUTABLE_PATHS = ['/usr/bin/git', '/opt/homebrew/bin/git', '/usr/local/bin/git'];
const GIT_EXECUTABLE = FIXED_GIT_EXECUTABLE_PATHS.find(candidate => fs.existsSync(candidate));

if (!GIT_EXECUTABLE) {
  throw new Error(`git executable was not found in ${FIXED_GIT_EXECUTABLE_PATHS.join(', ')}`);
}

function withTempRepo(prefix, callback) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    execFileSync(GIT_EXECUTABLE, ['init', '-b', 'main'], { cwd: tempDir });
    execFileSync(GIT_EXECUTABLE, ['config', 'user.name', 'Test User'], { cwd: tempDir });
    execFileSync(GIT_EXECUTABLE, ['config', 'user.email', 'test@example.com'], { cwd: tempDir });
    callback(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function writeRepoFile(rootDir, relativePath, content) {
  const targetPath = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
}

function commitAll(rootDir, message) {
  execFileSync(GIT_EXECUTABLE, ['add', '.'], { cwd: rootDir });
  execFileSync(GIT_EXECUTABLE, ['commit', '-m', message], { cwd: rootDir });
  return execFileSync(GIT_EXECUTABLE, ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim();
}

function escapeForRegex(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function createPilotEntryFixture(rootDir, generatedAt = '2026-03-16T08:00:00.000Z', releaseVerdict = 'GO') {
  const evidenceDate = generatedAt.slice(0, 10);
  const reportPath = `docs/release-gates/${evidenceDate}_production_pilot.md`;
  const evidenceIndexPath = `docs/pilot/PILOT_EVIDENCE_INDEX_${PILOT_ID}.md`;
  const runId = `pilot-entry-${generatedAt.replaceAll(/[-:]/g, '').replaceAll('.000Z', 'Z')}-${PILOT_ID}`;

  writeRepoFile(rootDir, reportPath, '# Release Gate\n');
  writeRepoFile(rootDir, evidenceIndexPath, '# Pilot Evidence Index\n');
  writeRepoFile(
    rootDir,
    'docs/pilot-evidence/index.csv',
    [
      'run_id,pilot_id,env_name,gate_suite,generated_at,release_verdict,report_path,evidence_index_path,legacy_log_path',
      `${runId},${PILOT_ID},production,all,${generatedAt},${releaseVerdict},${reportPath},${evidenceIndexPath},`,
      '',
    ].join('\n')
  );

  return {
    headSha: commitAll(rootDir, 'chore: commit pilot-entry artifacts'),
    reportPath,
    evidenceIndexPath,
    runId,
  };
}

test('pilot-ready tag cli treats --help as a standalone flag regardless of position', () => {
  assert.deepEqual(parseArgs(['--help', '--pilotId', PILOT_ID]), {
    ...createEmptyArgs(),
    help: true,
  });
});

test('createPilotReadyTag creates an annotated canonical tag bound to pilot-entry evidence', () => {
  withTempRepo('pilot-ready-tag-', rootDir => {
    const { headSha, reportPath, evidenceIndexPath } = createPilotEntryFixture(rootDir);

    const result = createPilotReadyTag({
      rootDir,
      pilotId: PILOT_ID,
      date: '2026-03-16',
    });

    assert.equal(result.tagName, 'pilot-ready-20260316');
    assert.equal(result.commitSha, headSha);
    assert.equal(result.reportPath, reportPath);

    const tagMessage = execFileSync(
      GIT_EXECUTABLE,
      ['tag', '-l', '--format=%(contents)', result.tagName],
      {
        cwd: rootDir,
        encoding: 'utf8',
      }
    );
    assert.match(tagMessage, /pilot_id=pilot-ks-week-1/);
    assert.match(tagMessage, new RegExp(`report_path=${escapeForRegex(reportPath)}`));
    assert.match(
      tagMessage,
      new RegExp(`evidence_index_path=${escapeForRegex(evidenceIndexPath)}`)
    );
    assert.match(tagMessage, /generated_at=2026-03-16T08:00:00\.000Z/);
    assert.match(tagMessage, /release_verdict=GO/);
  });
});

test('verifyPilotReadyTag rejects tags whose evidence date is stale for the requested date', () => {
  withTempRepo('pilot-ready-tag-stale-', rootDir => {
    createPilotEntryFixture(rootDir, '2026-03-15T08:00:00.000Z');
    createPilotReadyTag({
      rootDir,
      pilotId: PILOT_ID,
      date: '2026-03-15',
    });

    assert.throws(
      () =>
        verifyPilotReadyTag({
          rootDir,
          pilotId: PILOT_ID,
          tagName: 'pilot-ready-20260315',
          expectedDate: '2026-03-16',
        }),
      /pilot-ready tag evidence must match expected date 2026-03-16/
    );
  });
});

test('verifyPilotReadyTag rejects tags whose metadata no longer matches the canonical pilot-entry proof', () => {
  withTempRepo('pilot-ready-tag-metadata-', rootDir => {
    const { runId } = createPilotEntryFixture(rootDir);
    const result = createPilotReadyTag({
      rootDir,
      pilotId: PILOT_ID,
      date: '2026-03-16',
    });

    execFileSync(GIT_EXECUTABLE, ['tag', '-d', result.tagName], { cwd: rootDir });
    execFileSync(
      GIT_EXECUTABLE,
      [
        'tag',
        '-a',
        result.tagName,
        result.commitSha,
        '-m',
        [
          'pilot-ready tag for 2026-03-16',
          '',
          `pilot_id=${PILOT_ID}`,
          'date=2026-03-16',
          `run_id=${runId}`,
          'generated_at=2026-03-16T08:00:00.000Z',
          'release_verdict=FAIL',
          'report_path=docs/release-gates/2026-03-16_production_pilot.md',
          `evidence_index_path=docs/pilot/PILOT_EVIDENCE_INDEX_${PILOT_ID}.md`,
        ].join('\n'),
      ],
      { cwd: rootDir }
    );

    assert.throws(
      () =>
        verifyPilotReadyTag({
          rootDir,
          pilotId: PILOT_ID,
          expectedDate: '2026-03-16',
        }),
      /metadata mismatch for release_verdict/
    );
  });
});
