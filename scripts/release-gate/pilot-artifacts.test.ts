import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const {
  createPilotEntryArtifacts,
  parsePilotEvidenceIndex,
  recordPilotDailyEvidence,
  createPilotDailyEvidenceArgs,
  parsePilotDailyEvidenceArgs,
  createPilotDecisionArgs,
  parsePilotDecisionArgs,
  createPilotObservabilityArgs,
  parsePilotObservabilityArgs,
  createPilotCadenceArgs,
  parsePilotCadenceArgs,
  DEFAULT_PILOT_REPORT_PATH,
  withTempDir,
  setupPilotArtifactFixture,
  buildDailyEvidenceTemplate,
  buildCopiedDailyEvidenceIndex,
  createPilotEntryFixture,
  buildDailyEvidenceArgs,
} = require('./pilot-artifacts-test-helpers.ts');
test('createPilotEntryArtifacts copies the template, appends a canonical pointer row, and keeps stable doc references', () => {
  withTempDir('pilot-entry-artifacts-', tempDir => {
    const { pointerIndexPath, reportPath, templatePath } = setupPilotArtifactFixture(tempDir);
    const artifacts = createPilotEntryArtifacts({
      pilotId: 'pilot-ks-week-1',
      envName: 'production',
      suite: 'all',
      generatedAt: new Date('2026-03-15T10:11:12.000Z'),
      reportPath,
      releaseVerdict: 'GO',
      releaseGateTemplatePath: templatePath,
      pilotEvidenceIndexCsvPath: pointerIndexPath,
    });

    assert.equal(
      path.relative(tempDir, artifacts.evidenceIndexPath),
      path.join('docs', 'pilot', 'PILOT_EVIDENCE_INDEX_pilot-ks-week-1.md')
    );
    assert.ok(fs.existsSync(artifacts.evidenceIndexPath));

    const copiedIndex = fs.readFileSync(artifacts.evidenceIndexPath, 'utf8');
    assert.match(copiedIndex, /Copied from `docs\/pilot\/PILOT_EVIDENCE_INDEX_TEMPLATE\.md`/);
    assert.match(copiedIndex, /Pilot ID: `pilot-ks-week-1`/);
    assert.match(
      copiedIndex,
      /Release gate report: `docs\/release-gates\/2026-03-15_production_dpl_demo\.md`/
    );

    const parsed = parsePilotEvidenceIndex(fs.readFileSync(pointerIndexPath, 'utf8'));
    assert.equal(parsed.length, 1);
    assert.deepEqual(parsed[0], {
      run_id: 'pilot-entry-20260315T101112Z-pilot-ks-week-1',
      pilot_id: 'pilot-ks-week-1',
      env_name: 'production',
      gate_suite: 'all',
      generated_at: '2026-03-15T10:11:12.000Z',
      release_verdict: 'GO',
      report_path: 'docs/release-gates/2026-03-15_production_dpl_demo.md',
      evidence_index_path: 'docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-week-1.md',
      legacy_log_path: '',
    });
  });
});

test('createPilotEntryArtifacts preserves existing copied evidence index content on later pilot-entry runs', () => {
  withTempDir('pilot-entry-artifacts-reuse-', tempDir => {
    const fixture = setupPilotArtifactFixture(tempDir, {
      copiedIndexContent: '# Existing Index\n\n| Day | Date |\n| --- | --- |\n| 1 | 2026-03-15 |\n',
      templateContent: '# Template\n',
    });

    createPilotEntryArtifacts({
      pilotId: 'pilot-ks-week-1',
      envName: 'production',
      suite: 'all',
      generatedAt: new Date('2026-03-16T08:00:00.000Z'),
      reportPath: fixture.reportPath,
      releaseVerdict: 'NO-GO',
      releaseGateTemplatePath: fixture.templatePath,
      pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
    });

    assert.equal(
      fs.readFileSync(fixture.copiedIndexPath, 'utf8'),
      '# Existing Index\n\n| Day | Date |\n| --- | --- |\n| 1 | 2026-03-15 |\n'
    );
    const parsed = parsePilotEvidenceIndex(fs.readFileSync(fixture.pointerIndexPath, 'utf8'));
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].release_verdict, 'NO-GO');
    assert.equal(
      parsed[0].evidence_index_path,
      'docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-week-1.md'
    );
  });
});

test('createPilotEntryArtifacts normalizes run ids to whole-second timestamps', () => {
  withTempDir('pilot-entry-artifacts-seconds-', tempDir => {
    const fixture = setupPilotArtifactFixture(tempDir, {
      templateContent: '# Template\n',
    });

    const artifacts = createPilotEntryArtifacts({
      rootDir: tempDir,
      pilotId: 'pilot-ks-week-1',
      envName: 'production',
      suite: 'all',
      generatedAt: new Date('2026-03-15T10:11:12.123Z'),
      reportPath: fixture.reportPath,
      releaseVerdict: 'GO',
    });

    assert.equal(artifacts.runId, 'pilot-entry-20260315T101112Z-pilot-ks-week-1');
  });
});

test('createPilotEntryArtifacts rejects artifact paths that escape the canonical docs contract', () => {
  withTempDir('pilot-entry-artifacts-contract-', tempDir => {
    const fixture = setupPilotArtifactFixture(tempDir, {
      pointerIndexContent: false,
      reportContent: false,
      templateContent: '# Template\n',
    });
    const escapedReportDir = path.join(tempDir, 'tmp', 'release-gates');
    const escapedReportPath = path.join(escapedReportDir, '2026-03-15_production_dpl_demo.md');

    fs.mkdirSync(escapedReportDir, { recursive: true });
    fs.writeFileSync(escapedReportPath, '# Release Gate\n', 'utf8');

    assert.throws(
      () =>
        createPilotEntryArtifacts({
          rootDir: tempDir,
          pilotId: 'pilot-ks-week-1',
          envName: 'production',
          suite: 'all',
          generatedAt: new Date('2026-03-15T10:11:12.000Z'),
          reportPath: escapedReportPath,
          releaseVerdict: 'GO',
          releaseGateTemplatePath: fixture.templatePath,
        }),
      /must stay under docs\//
    );
  });
});

test('createPilotEntryArtifacts rejects non-production pilot-entry artifact runs', () => {
  withTempDir('pilot-entry-artifacts-env-', tempDir => {
    const fixture = setupPilotArtifactFixture(tempDir, {
      templateContent: '# Template\n',
    });

    assert.throws(
      () =>
        createPilotEntryArtifacts({
          rootDir: tempDir,
          pilotId: 'pilot-ks-week-1',
          envName: 'staging',
          suite: 'all',
          generatedAt: new Date('2026-03-15T10:11:12.000Z'),
          reportPath: fixture.reportPath,
          releaseVerdict: 'GO',
          releaseGateTemplatePath: fixture.templatePath,
          pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
        }),
      /pilot-entry artifacts require envName "production"/
    );
  });
});

test('createPilotEntryArtifacts rejects partial gate suites for pilot-entry artifact runs', () => {
  withTempDir('pilot-entry-artifacts-suite-', tempDir => {
    const fixture = setupPilotArtifactFixture(tempDir, {
      templateContent: '# Template\n',
    });

    assert.throws(
      () =>
        createPilotEntryArtifacts({
          rootDir: tempDir,
          pilotId: 'pilot-ks-week-1',
          envName: 'production',
          suite: 'p1',
          generatedAt: new Date('2026-03-15T10:11:12.000Z'),
          reportPath: fixture.reportPath,
          releaseVerdict: 'GO',
          releaseGateTemplatePath: fixture.templatePath,
          pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
        }),
      /pilot-entry artifacts require suite "all"/
    );
  });
});

test('createPilotEntryArtifacts rejects pointer rows outside the canonical pilot evidence index csv', () => {
  withTempDir('pilot-entry-artifacts-pointer-', tempDir => {
    const fixture = setupPilotArtifactFixture(tempDir, {
      templateContent: '# Template\n',
    });
    const nonCanonicalPointerPath = path.join(tempDir, 'docs', 'pilot-evidence', 'pilot-entry.csv');

    assert.throws(
      () =>
        createPilotEntryArtifacts({
          rootDir: tempDir,
          pilotId: 'pilot-ks-week-1',
          envName: 'production',
          suite: 'all',
          generatedAt: new Date('2026-03-15T10:11:12.000Z'),
          reportPath: fixture.reportPath,
          releaseVerdict: 'GO',
          releaseGateTemplatePath: fixture.templatePath,
          pilotEvidenceIndexCsvPath: nonCanonicalPointerPath,
        }),
      /pilot-entry pointer rows must be written to docs\/pilot-evidence\/index\.csv; received docs\/pilot-evidence\/pilot-entry\.csv/
    );
  });
});

test('recordPilotDailyEvidence updates the copied per-pilot evidence index with the required daily fields', () => {
  withTempDir('pilot-daily-evidence-', tempDir => {
    const fixture = createPilotEntryFixture(tempDir, { dayCount: 2 });

    const result = recordPilotDailyEvidence({
      rootDir: tempDir,
      ...buildDailyEvidenceArgs(),
      pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
    });

    assert.equal(
      path.relative(tempDir, result.evidenceIndexPath),
      path.join('docs', 'pilot', 'PILOT_EVIDENCE_INDEX_pilot-ks-week-1.md')
    );
    assert.equal(result.reportPath, DEFAULT_PILOT_REPORT_PATH);

    const copiedIndex = fs.readFileSync(fixture.copiedIndexPath, 'utf8');
    assert.match(
      copiedIndex,
      /\| 1 \| 2026-03-15 \| Admin KS \| green \| docs\/release-gates\/2026-03-15_production_dpl_demo\.md \| n\/a \| 0 \| none \| continue \|/
    );
    assert.match(copiedIndex, /\| 2 \| {2}\| {2}\| {2}\| {2}\| {2}\| {2}\| {2}\| {2}\|/);
  });
});

test('recordPilotDailyEvidence trims valid dates before writing the copied evidence row', () => {
  withTempDir('pilot-daily-evidence-trim-date-', tempDir => {
    const fixture = createPilotEntryFixture(tempDir);

    recordPilotDailyEvidence({
      rootDir: tempDir,
      ...buildDailyEvidenceArgs({
        date: '2026-03-15 ',
      }),
      pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
    });

    const copiedIndex = fs.readFileSync(fixture.copiedIndexPath, 'utf8');
    assert.match(
      copiedIndex,
      /\| 1 \| 2026-03-15 \| Admin KS \| green \| docs\/release-gates\/2026-03-15_production_dpl_demo\.md \| n\/a \| 0 \| none \| continue \|/
    );
  });
});

test('recordPilotDailyEvidence fails if the copied daily row is not actually persisted', () => {
  withTempDir('pilot-daily-evidence-persist-check-', tempDir => {
    const fixture = createPilotEntryFixture(tempDir, { dayCount: 2 });
    const originalWriteFileSync = fs.writeFileSync;

    fs.writeFileSync = function patchedWriteFileSync(targetPath, content, ...rest) {
      if (String(targetPath) === fixture.copiedIndexPath) {
        const damagedContent = String(content)
          .split('\n')
          .map(line => (line.startsWith('| 1 | ') ? '| 1 |  |  |  |  |  |  |  |  |' : line))
          .join('\n');
        return originalWriteFileSync.call(fs, targetPath, damagedContent, ...rest);
      }

      return originalWriteFileSync.call(fs, targetPath, content, ...rest);
    };

    try {
      assert.throws(
        () =>
          recordPilotDailyEvidence({
            rootDir: tempDir,
            ...buildDailyEvidenceArgs(),
            pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
          }),
        /daily evidence row for day 1 was not persisted in copied pilot evidence index/
      );
    } finally {
      fs.writeFileSync = originalWriteFileSync;
    }
  });
});

test('recordPilotDailyEvidence can override report and bundle paths while preserving the pointer index as a separate layer', () => {
  withTempDir('pilot-daily-evidence-override-', tempDir => {
    const fixture = setupPilotArtifactFixture(tempDir, {
      templateContent: buildDailyEvidenceTemplate(),
      pointerIndexContent: [
        'run_id,pilot_id,env_name,gate_suite,generated_at,release_verdict,report_path,evidence_index_path,legacy_log_path',
        'pilot-entry-20260314T101112Z-pilot-ks-week-1,pilot-ks-week-1,production,all,2026-03-14T10:11:12.000Z,NO-GO,docs/release-gates/2026-03-14_production_unknown.md,docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-week-1.md,',
        'pilot-entry-20260315T101112Z-pilot-ks-week-1,pilot-ks-week-1,production,all,2026-03-15T10:11:12.000Z,GO,docs/release-gates/2026-03-15_production_dpl_demo.md,docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-week-1.md,',
        '',
      ].join('\n'),
      copiedIndexContent: buildCopiedDailyEvidenceIndex(),
    });

    const result = recordPilotDailyEvidence({
      rootDir: tempDir,
      pilotId: 'pilot-ks-week-1',
      day: 1,
      date: '2026-03-16',
      owner: 'Admin KS',
      status: 'amber',
      incidentCount: 2,
      highestSeverity: 'sev2',
      decision: 'hotfix',
      reportPath: 'docs/release-gates/2026-03-16_production_dpl_hotfix.md',
      bundlePath: 'tmp/pilot-evidence/phase-5.1/2026-03-16T08-00-00+0100/',
      pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
    });

    assert.equal(result.reportPath, 'docs/release-gates/2026-03-16_production_dpl_hotfix.md');

    const copiedIndex = fs.readFileSync(fixture.copiedIndexPath, 'utf8');
    assert.match(
      copiedIndex,
      /\| 1 \| 2026-03-16 \| Admin KS \| amber \| docs\/release-gates\/2026-03-16_production_dpl_hotfix\.md \| tmp\/pilot-evidence\/phase-5\.1\/2026-03-16T08-00-00\+0100\/ \| 2 \| sev2 \| hotfix \|/
    );

    const pointerIndex = fs.readFileSync(fixture.pointerIndexPath, 'utf8');
    assert.doesNotMatch(pointerIndex, /2026-03-16_production_dpl_hotfix/);
  });
});

test('recordPilotDailyEvidence rejects updates when the canonical pilot-entry artifact set does not exist yet', () => {
  withTempDir('pilot-daily-evidence-missing-', tempDir => {
    const fixture = setupPilotArtifactFixture(tempDir, {
      pointerIndexContent: [
        'run_id,pilot_id,env_name,gate_suite,generated_at,release_verdict,report_path,evidence_index_path,legacy_log_path',
        '',
      ].join('\n'),
      copiedIndexContent: false,
    });

    assert.throws(
      () =>
        recordPilotDailyEvidence({
          rootDir: tempDir,
          pilotId: 'pilot-ks-week-1',
          day: 1,
          date: '2026-03-15',
          owner: 'Admin KS',
          status: 'green',
          incidentCount: 0,
          highestSeverity: 'none',
          decision: 'continue',
          bundlePath: 'n/a',
          pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
        }),
      /pilot-entry artifact set must exist before daily evidence can be recorded/
    );
  });
});

test('pilot daily evidence cli treats --help as a standalone flag regardless of position', () => {
  assert.deepEqual(parsePilotDailyEvidenceArgs(['--help', '--pilotId', 'pilot-ks-week-1']), {
    ...createPilotDailyEvidenceArgs(),
    help: true,
  });
});

test('pilot decision proof cli treats --help as a standalone flag regardless of position', () => {
  assert.deepEqual(parsePilotDecisionArgs(['--help', '--pilotId', 'pilot-ks-week-1']), {
    ...createPilotDecisionArgs(),
    help: true,
  });
});

test('pilot observability evidence cli treats --help as a standalone flag regardless of position', () => {
  assert.deepEqual(parsePilotObservabilityArgs(['--help', '--pilotId', 'pilot-ks-week-1']), {
    ...createPilotObservabilityArgs(),
    help: true,
  });
});

test('pilot readiness cadence cli treats --help as a standalone flag regardless of position', () => {
  assert.deepEqual(parsePilotCadenceArgs(['--help', '--pilotId', 'pilot-ks-week-1']), {
    ...createPilotCadenceArgs(),
    help: true,
  });
});

test('recordPilotDailyEvidence rejects report paths that escape docs/release-gates', () => {
  withTempDir('pilot-daily-evidence-traversal-', tempDir => {
    const fixture = createPilotEntryFixture(tempDir);

    assert.throws(
      () =>
        recordPilotDailyEvidence({
          rootDir: tempDir,
          ...buildDailyEvidenceArgs({
            reportPath: 'docs/release-gates/../pilot/escape.md',
          }),
          pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
        }),
      /reportPath must stay under docs\/release-gates\/ without "\.\." segments/
    );
  });
});

test('recordPilotDailyEvidence rejects markdown-breaking cell content', () => {
  withTempDir('pilot-daily-evidence-markdown-', tempDir => {
    const fixture = createPilotEntryFixture(tempDir);

    assert.throws(
      () =>
        recordPilotDailyEvidence({
          rootDir: tempDir,
          ...buildDailyEvidenceArgs({
            owner: 'Admin | KS',
            reportPath: DEFAULT_PILOT_REPORT_PATH,
          }),
          pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
        }),
      /owner must not contain "\|", carriage returns, or newlines/
    );

    assert.throws(
      () =>
        recordPilotDailyEvidence({
          rootDir: tempDir,
          ...buildDailyEvidenceArgs({
            reportPath: DEFAULT_PILOT_REPORT_PATH,
            bundlePath: 'tmp/pilot-evidence|\n',
          }),
          pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
        }),
      /bundlePath must not contain "\|", carriage returns, or newlines/
    );
  });
});
