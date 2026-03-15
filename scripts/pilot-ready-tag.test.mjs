import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { createPilotEntryArtifacts } = require('./release-gate/pilot-artifacts.ts');
const {
  createEmptyArgs,
  createPilotReadyTag,
  parseArgs,
  verifyPilotReadyTag,
} = require('./pilot-ready-tag.js');

const PILOT_ID = 'pilot-ks-week-1';

function withTempRepo(prefix, callback) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: tempDir });
    execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: tempDir });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: tempDir });
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
  execFileSync('git', ['add', '.'], { cwd: rootDir });
  execFileSync('git', ['commit', '-m', message], { cwd: rootDir });
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim();
}

function createPilotEntryFixture(rootDir, generatedAt = '2026-03-16T08:00:00.000Z') {
  writeRepoFile(
    rootDir,
    'docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md',
    '# Pilot Evidence Index Template\n\n| Day | Date |\n| --- | --- |\n| 1 | |\n'
  );
  writeRepoFile(rootDir, 'docs/release-gates/2026-03-16_production_pilot.md', '# Release Gate\n');

  const headSha = commitAll(rootDir, 'chore: seed pilot-ready fixture');
  const artifacts = createPilotEntryArtifacts({
    rootDir,
    pilotId: PILOT_ID,
    envName: 'production',
    suite: 'all',
    generatedAt,
    releaseVerdict: 'GO',
    reportPath: path.join(rootDir, 'docs/release-gates/2026-03-16_production_pilot.md'),
  });

  const artifactSha = commitAll(rootDir, 'chore: commit pilot-entry artifacts');

  return { artifacts, headSha: artifactSha };
}

test('pilot-ready tag cli treats --help as a standalone flag regardless of position', () => {
  assert.deepEqual(parseArgs(['--help', '--pilotId', PILOT_ID]), {
    ...createEmptyArgs(),
    help: true,
  });
});

test('createPilotReadyTag creates an annotated canonical tag bound to pilot-entry evidence', () => {
  withTempRepo('pilot-ready-tag-', rootDir => {
    const { headSha } = createPilotEntryFixture(rootDir);

    const result = createPilotReadyTag({
      rootDir,
      pilotId: PILOT_ID,
      date: '2026-03-16',
    });

    assert.equal(result.tagName, 'pilot-ready-20260316');
    assert.equal(result.commitSha, headSha);
    assert.equal(result.reportPath, 'docs/release-gates/2026-03-16_production_pilot.md');

    const tagMessage = execFileSync('git', ['tag', '-l', '--format=%(contents)', result.tagName], {
      cwd: rootDir,
      encoding: 'utf8',
    });
    assert.match(tagMessage, /pilot_id=pilot-ks-week-1/);
    assert.match(tagMessage, /report_path=docs\/release-gates\/2026-03-16_production_pilot\.md/);
    assert.match(tagMessage, /evidence_index_path=docs\/pilot\/PILOT_EVIDENCE_INDEX_pilot-ks-week-1\.md/);
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
