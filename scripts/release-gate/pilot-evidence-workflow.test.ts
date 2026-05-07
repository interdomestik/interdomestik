import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const {
  CANONICAL_DECISION_PROOF_HEADERS,
  evaluatePilotReadinessCadence,
  recordPilotDecisionProof,
  recordPilotObservabilityEvidence,
  PILOT_ID,
  DAILY_EVIDENCE_TEMPLATE_LINES,
  OBSERVABILITY_HEADERS,
  OBSERVABILITY_SEPARATOR_LINE,
  DECISION_PROOF_SEPARATOR_LINE,
  withTempDir,
  setupPilotArtifactFixture,
  buildDailyEvidenceTemplate,
  buildCadenceDailyRow,
  buildCadencePointerIndexContent,
  setupCadenceFixture,
  createPilotEntryFixture,
  buildDecisionProofArgs,
  buildObservabilityEvidenceArgs,
} = require('./pilot-artifacts-test-helpers.ts');
test('recordPilotObservabilityEvidence writes structured log sweep and KPI evidence into the copied index', () => {
  withTempDir('pilot-observability-evidence-', tempDir => {
    const fixture = createPilotEntryFixture(tempDir, { dayCount: 2 });

    const result = recordPilotObservabilityEvidence({
      ...buildObservabilityEvidenceArgs({
        rootDir: tempDir,
        pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
      }),
    });

    assert.equal(
      path.relative(tempDir, result.evidenceIndexPath),
      path.join('docs', 'pilot', 'PILOT_EVIDENCE_INDEX_pilot-ks-week-1.md')
    );

    const copiedIndex = fs.readFileSync(fixture.copiedIndexPath, 'utf8');
    assert.match(copiedIndex, /## Observability Evidence Log/);
    assert.match(
      copiedIndex,
      /\| day-1 \| 2026-03-15 \| Admin KS \| expected-noise \| 0 \| 2 \| within-threshold \| 0 \| none \| n\/a \|/
    );
  });
});

test('recordPilotObservabilityEvidence normalizes existing reference casing instead of creating duplicates', () => {
  withTempDir('pilot-observability-normalize-', tempDir => {
    const fixture = setupPilotArtifactFixture(tempDir, {
      templateContent: buildDailyEvidenceTemplate(1),
      pointerIndexContent: buildCadencePointerIndexContent(),
      copiedIndexContent: [
        '# Pilot Evidence Index — pilot-ks-week-1',
        '',
        ...DAILY_EVIDENCE_TEMPLATE_LINES,
        '| 1 | 2026-03-15 | Admin KS | green | docs/release-gates/2026-03-15_production_dpl_demo.md | n/a | 0 | none | continue |',
        '',
        '## Observability Evidence Log',
        '',
        `| ${OBSERVABILITY_HEADERS.join(' | ')} |`,
        OBSERVABILITY_SEPARATOR_LINE,
        '| Day-1 | 2026-03-14 | Admin KS | clear | 0 | 0 | within-threshold | 0 | none | stale |',
        '',
        '## Decision Proof Log',
        '',
        `| ${CANONICAL_DECISION_PROOF_HEADERS.join(' | ')} |`,
        DECISION_PROOF_SEPARATOR_LINE,
        '',
      ].join('\n'),
    });

    recordPilotObservabilityEvidence({
      ...buildObservabilityEvidenceArgs({
        rootDir: tempDir,
        pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
      }),
    });

    const copiedIndex = fs.readFileSync(fixture.copiedIndexPath, 'utf8');
    assert.equal(copiedIndex.match(/\| day-1 \|/g)?.length, 1);
    assert.match(
      copiedIndex,
      /\| day-1 \| 2026-03-15 \| Admin KS \| expected-noise \| 0 \| 2 \| within-threshold \| 0 \| none \| n\/a \|/
    );
  });
});

test('recordPilotObservabilityEvidence rejects partial numeric evidence counts', () => {
  withTempDir('pilot-observability-counts-', tempDir => {
    const fixture = createPilotEntryFixture(tempDir);

    assert.throws(
      () =>
        recordPilotObservabilityEvidence({
          ...buildObservabilityEvidenceArgs({
            rootDir: tempDir,
            functionalErrorCount: '1.5',
            pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
          }),
        }),
      /functionalErrorCount must be a non-negative integer/
    );

    assert.throws(
      () =>
        recordPilotObservabilityEvidence({
          ...buildObservabilityEvidenceArgs({
            rootDir: tempDir,
            expectedAuthDenyCount: '12abc',
            pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
          }),
        }),
      /expectedAuthDenyCount must be a non-negative integer/
    );
  });
});

test('recordPilotDecisionProof records repo-backed daily and weekly decisions in the copied evidence index', () => {
  withTempDir('pilot-decision-proof-', tempDir => {
    const fixture = createPilotEntryFixture(tempDir, { dayCount: 2 });

    recordPilotObservabilityEvidence({
      ...buildObservabilityEvidenceArgs({
        rootDir: tempDir,
        reference: 'day-1',
        pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
      }),
    });
    recordPilotObservabilityEvidence({
      ...buildObservabilityEvidenceArgs({
        rootDir: tempDir,
        reference: 'week-1',
        date: '2026-03-21',
        logSweepResult: 'clear',
        expectedAuthDenyCount: 0,
        pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
      }),
    });

    const dailyResult = recordPilotDecisionProof({
      ...buildDecisionProofArgs({
        rootDir: tempDir,
        decision: 'pause',
        pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
      }),
    });
    const weeklyResult = recordPilotDecisionProof({
      ...buildDecisionProofArgs({
        rootDir: tempDir,
        reviewType: 'weekly',
        reference: 'week-1',
        date: '2026-03-21',
        decision: 'stop',
        rollbackTarget: 'pilot-ready-20260315',
        pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
      }),
    });

    assert.equal(dailyResult.requirements.requiresPilotCheck, 'yes');
    assert.equal(dailyResult.requirements.requiresReleaseGate, 'no');
    assert.equal(weeklyResult.requirements.requiresPilotCheck, 'yes');
    assert.equal(weeklyResult.requirements.requiresReleaseGate, 'yes');

    const copiedIndex = fs.readFileSync(fixture.copiedIndexPath, 'utf8');
    assert.match(copiedIndex, /## Decision Proof Log/);
    assert.match(
      copiedIndex,
      /\| daily \| day-1 \| 2026-03-15 \| Admin KS \| pause \| n\/a \| day-1 \| yes \| no \|/
    );
    assert.match(
      copiedIndex,
      /\| weekly \| week-1 \| 2026-03-21 \| Admin KS \| stop \| pilot-ready-20260315 \| week-1 \| yes \| yes \|/
    );
  });
});

test('recordPilotDecisionProof requires linked observability evidence for the referenced review window', () => {
  withTempDir('pilot-decision-proof-observability-', tempDir => {
    const fixture = createPilotEntryFixture(tempDir);

    assert.throws(
      () =>
        recordPilotDecisionProof({
          ...buildDecisionProofArgs({
            rootDir: tempDir,
            pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
          }),
        }),
      /observability evidence must exist for reference day-1 before decision proof can be recorded/
    );
  });
});

test('recordPilotDecisionProof requires rollback tags for hotfix and stop decisions', () => {
  withTempDir('pilot-decision-proof-rollback-', tempDir => {
    const fixture = createPilotEntryFixture(tempDir);

    assert.throws(
      () =>
        recordPilotDecisionProof({
          ...buildDecisionProofArgs({
            rootDir: tempDir,
            reviewType: 'weekly',
            reference: 'week-1',
            date: '2026-03-21',
            decision: 'stop',
            pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
          }),
          rollbackTarget: 'n/a',
        }),
      /rollbackTarget must use pilot-ready-YYYYMMDD for hotfix or stop/
    );
  });
});

test('recordPilotDecisionProof rejects malformed review references', () => {
  withTempDir('pilot-decision-proof-reference-', tempDir => {
    const fixture = createPilotEntryFixture(tempDir);

    assert.throws(
      () =>
        recordPilotDecisionProof({
          ...buildDecisionProofArgs({
            rootDir: tempDir,
            reference: 'week-1',
            pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
          }),
        }),
      /daily decision references must use day-<n>/
    );
  });
});

test('recordPilotDecisionProof upgrades copied evidence indexes that predate the decision log section', () => {
  withTempDir('pilot-decision-proof-upgrade-', tempDir => {
    const fixture = setupPilotArtifactFixture(tempDir, {
      templateContent: buildDailyEvidenceTemplate(1),
      pointerIndexContent: [
        'run_id,pilot_id,env_name,gate_suite,generated_at,release_verdict,report_path,evidence_index_path,legacy_log_path',
        'pilot-entry-20260315T101112Z-pilot-ks-week-1,pilot-ks-week-1,production,all,2026-03-15T10:11:12.000Z,GO,docs/release-gates/2026-03-15_production_dpl_demo.md,docs/pilot/PILOT_EVIDENCE_INDEX_pilot-ks-week-1.md,',
        '',
      ].join('\n'),
      copiedIndexContent: [
        '# Pilot Evidence Index — pilot-ks-week-1',
        '',
        ...DAILY_EVIDENCE_TEMPLATE_LINES,
        '| 1 | 2026-03-15 | Admin KS | green | docs/release-gates/2026-03-15_production_dpl_demo.md | n/a | 0 | none | continue |',
        '',
      ].join('\n'),
    });

    recordPilotObservabilityEvidence({
      ...buildObservabilityEvidenceArgs({
        rootDir: tempDir,
        pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
      }),
    });

    recordPilotDecisionProof({
      ...buildDecisionProofArgs({
        rootDir: tempDir,
        pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
      }),
    });

    const copiedIndex = fs.readFileSync(fixture.copiedIndexPath, 'utf8');
    assert.match(copiedIndex, /## Decision Proof Log/);
    assert.match(
      copiedIndex,
      /\| daily \| day-1 \| 2026-03-15 \| Admin KS \| continue \| n\/a \| day-1 \| no \| no \|/
    );
  });
});

test('recordPilotObservabilityEvidence upgrades copied evidence indexes that predate the observability section', () => {
  withTempDir('pilot-observability-upgrade-', tempDir => {
    const fixture = setupPilotArtifactFixture(tempDir, {
      templateContent: buildDailyEvidenceTemplate(1),
      pointerIndexContent: buildCadencePointerIndexContent(),
      copiedIndexContent: [
        '# Pilot Evidence Index — pilot-ks-week-1',
        '',
        ...DAILY_EVIDENCE_TEMPLATE_LINES,
        '| 1 | 2026-03-15 | Admin KS | green | docs/release-gates/2026-03-15_production_dpl_demo.md | n/a | 0 | none | continue |',
        '',
        '## Decision Proof Log',
        '',
        `| ${CANONICAL_DECISION_PROOF_HEADERS.join(' | ')} |`,
        DECISION_PROOF_SEPARATOR_LINE,
        '',
      ].join('\n'),
    });

    recordPilotObservabilityEvidence({
      ...buildObservabilityEvidenceArgs({
        rootDir: tempDir,
        pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
      }),
    });

    const copiedIndex = fs.readFileSync(fixture.copiedIndexPath, 'utf8');
    assert.match(copiedIndex, /## Observability Evidence Log/);
    assert.match(
      copiedIndex,
      /\| day-1 \| 2026-03-15 \| Admin KS \| expected-noise \| 0 \| 2 \| within-threshold \| 0 \| none \| n\/a \|/
    );
  });
});

test('recordPilotDecisionProof rejects pointer rows whose evidence index escapes docs/pilot', () => {
  withTempDir('pilot-decision-proof-contract-', tempDir => {
    const fixture = setupPilotArtifactFixture(tempDir, {
      templateContent: buildDailyEvidenceTemplate(),
      pointerIndexContent: [
        'run_id,pilot_id,env_name,gate_suite,generated_at,release_verdict,report_path,evidence_index_path,legacy_log_path',
        'pilot-entry-20260315T101112Z-pilot-ks-week-1,pilot-ks-week-1,production,all,2026-03-15T10:11:12.000Z,GO,docs/release-gates/2026-03-15_production_dpl_demo.md,docs/release-gates/2026-03-15_production_dpl_demo.md,',
        '',
      ].join('\n'),
    });

    assert.throws(
      () =>
        recordPilotDecisionProof({
          ...buildDecisionProofArgs({
            rootDir: tempDir,
            pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
          }),
        }),
      /pilot evidence index path must stay under docs\/pilot\//
    );
  });
});

test('evaluatePilotReadinessCadence passes when the latest pilot evidence index has three consecutive qualifying green days', () => {
  withTempDir('pilot-readiness-cadence-pass-', tempDir => {
    const fixture = setupCadenceFixture(
      tempDir,
      [buildCadenceDailyRow(1), buildCadenceDailyRow(2), buildCadenceDailyRow(3)],
      4
    );

    const result = evaluatePilotReadinessCadence({
      rootDir: tempDir,
      pilotId: PILOT_ID,
      requiredStreak: 3,
      pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
    });

    assert.equal(result.satisfied, true);
    assert.equal(result.longestStreak, 3);
    assert.deepEqual(result.qualifyingDates, ['2026-03-15', '2026-03-16', '2026-03-17']);
  });
});

test('evaluatePilotReadinessCadence fails when the green days are not consecutive qualifying days', () => {
  withTempDir('pilot-readiness-cadence-fail-', tempDir => {
    const fixture = setupCadenceFixture(
      tempDir,
      [
        buildCadenceDailyRow(1),
        buildCadenceDailyRow(2, {
          status: 'amber',
          incidentCount: '1',
          highestSeverity: 'sev3',
          decision: 'pause',
        }),
        buildCadenceDailyRow(3),
        buildCadenceDailyRow(4),
      ],
      4
    );

    const result = evaluatePilotReadinessCadence({
      rootDir: tempDir,
      pilotId: PILOT_ID,
      requiredStreak: 3,
      pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
    });

    assert.equal(result.satisfied, false);
    assert.equal(result.longestStreak, 2);
    assert.deepEqual(result.qualifyingDates, ['2026-03-17', '2026-03-18']);
  });
});

test('evaluatePilotReadinessCadence rejects partially numeric required streak values', () => {
  withTempDir('pilot-readiness-cadence-required-streak-', tempDir => {
    const fixture = setupCadenceFixture(tempDir, [buildCadenceDailyRow(1)], 1);

    assert.throws(
      () =>
        evaluatePilotReadinessCadence({
          rootDir: tempDir,
          pilotId: PILOT_ID,
          requiredStreak: '3days',
          pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
        }),
      /requiredStreak must be a positive integer/
    );
  });
});
