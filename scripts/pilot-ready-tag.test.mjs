import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { execGit } = require('./git-exec.js');
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
    execGit(['init', '-b', 'main'], { cwd: tempDir });
    execGit(['config', 'user.name', 'Test User'], { cwd: tempDir });
    execGit(['config', 'user.email', 'test@example.com'], { cwd: tempDir });
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
  execGit(['add', '.'], { cwd: rootDir });
  execGit(['commit', '-m', message], { cwd: rootDir });
  return execGit(['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim();
}

function escapeForRegex(value) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function createPilotEntryFixture(rootDir, generatedAt = '2026-03-16T08:00:00.000Z', releaseVerdict = 'GO') {
  const evidenceDate = generatedAt.slice(0, 10);
  const reportPath = path.join(rootDir, 'docs/release-gates', `${evidenceDate}_production_pilot.md`);

  writeRepoFile(rootDir, 'docs/pilot/PILOT_EVIDENCE_INDEX_TEMPLATE.md', '# Pilot Evidence Index\n');
  writeRepoFile(rootDir, path.relative(rootDir, reportPath), '# Release Gate\n');
  commitAll(rootDir, 'chore: seed pilot-ready fixture');

  const artifacts = createPilotEntryArtifacts({
    rootDir,
    pilotId: PILOT_ID,
    envName: 'production',
    suite: 'all',
    generatedAt,
    releaseVerdict,
    reportPath,
  });

  return {
    headSha: commitAll(rootDir, 'chore: commit pilot-entry artifacts'),
    reportPath: path.relative(rootDir, reportPath).replaceAll(path.sep, '/'),
    evidenceIndexPath: path.relative(rootDir, artifacts.evidenceIndexPath).replaceAll(path.sep, '/'),
    runId: artifacts.runId,
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

    const tagMessage = execGit(['tag', '-l', '--format=%(contents)', result.tagName], {
      cwd: rootDir,
      encoding: 'utf8',
    });
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

    execGit(['tag', '-d', result.tagName], { cwd: rootDir });
    execGit(
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
