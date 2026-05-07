const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  CANONICAL_DECISION_PROOF_HEADERS,
  CANONICAL_OBSERVABILITY_EVIDENCE_HEADERS,
  CANONICAL_OBSERVABILITY_EVIDENCE_SEPARATOR,
  createPilotEntryArtifacts,
  evaluatePilotReadinessCadence,
  parsePilotEvidenceIndex,
  recordPilotDailyEvidence,
  recordPilotDecisionProof,
  recordPilotObservabilityEvidence,
} = require('./pilot-artifacts.ts');
const {
  createEmptyArgs: createPilotDailyEvidenceArgs,
  parseArgs: parsePilotDailyEvidenceArgs,
} = require('../pilot-daily-evidence.ts');
const {
  createEmptyArgs: createPilotDecisionArgs,
  parseArgs: parsePilotDecisionArgs,
} = require('../pilot-decision-proof.ts');
const {
  createEmptyArgs: createPilotObservabilityArgs,
  parseArgs: parsePilotObservabilityArgs,
} = require('../pilot-observability-evidence.ts');
const {
  createEmptyArgs: createPilotCadenceArgs,
  parseArgs: parsePilotCadenceArgs,
} = require('../pilot-readiness-cadence.ts');

const PILOT_ID = 'pilot-ks-week-1';
const PILOT_GENERATED_AT = new Date('2026-03-15T10:11:12.000Z');
const DEFAULT_PILOT_REPORT_PATH = 'docs/release-gates/2026-03-15_production_dpl_demo.md';
const DAILY_EVIDENCE_TEMPLATE_LINES = [
  '# Pilot Evidence Index Template',
  '',
  '| Day | Date (YYYY-MM-DD) | Owner | Status (`green`/`amber`/`red`) | Release Report Path | Evidence Bundle Path | Incidents (count) | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Decision (`continue`/`pause`/`hotfix`/`stop`) |',
  '| --- | ----------------- | ----- | ------------------------------ | ------------------- | -------------------- | ----------------- | ----------------------------------------- | --------------------------------------------- |',
];
const OBSERVABILITY_HEADERS = CANONICAL_OBSERVABILITY_EVIDENCE_HEADERS;
const OBSERVABILITY_SEPARATOR_LINE = `| ${CANONICAL_OBSERVABILITY_EVIDENCE_SEPARATOR.join(' | ')} |`;
const DECISION_PROOF_SEPARATOR_LINE =
  '| ------------------------------- | --------- | ----------------- | ----- | ---------------------------------------------- | ----------------------------------------------- | ----------------- | ------------------------------------ | --------------------------------------------------------------- |';

function withTempDir(prefix, callback) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    callback(tempDir);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function setupPilotArtifactFixture(tempDir, options = {}) {
  const docsDir = path.join(tempDir, 'docs');
  const reportDir = path.join(docsDir, 'release-gates');
  const pilotDir = path.join(docsDir, 'pilot');
  const indexDir = path.join(docsDir, 'pilot-evidence');

  fs.mkdirSync(reportDir, { recursive: true });
  fs.mkdirSync(pilotDir, { recursive: true });
  fs.mkdirSync(indexDir, { recursive: true });

  const templatePath = path.join(pilotDir, 'PILOT_EVIDENCE_INDEX_TEMPLATE.md');
  const reportPath = path.join(reportDir, '2026-03-15_production_dpl_demo.md');
  const pointerIndexPath = path.join(indexDir, 'index.csv');
  const copiedIndexPath = path.join(pilotDir, 'PILOT_EVIDENCE_INDEX_pilot-ks-week-1.md');

  if (options.templateContent !== false) {
    fs.writeFileSync(
      templatePath,
      options.templateContent ??
        '# Pilot Evidence Index Template\n\n| Day | Date |\n| --- | --- |\n| 1 | |\n',
      'utf8'
    );
  }

  if (options.reportContent !== false) {
    fs.writeFileSync(reportPath, options.reportContent ?? '# Release Gate\n', 'utf8');
  }

  if (options.pointerIndexContent !== false) {
    fs.writeFileSync(
      pointerIndexPath,
      options.pointerIndexContent ??
        'run_id,pilot_id,env_name,gate_suite,generated_at,release_verdict,report_path,evidence_index_path\n',
      'utf8'
    );
  }

  if (options.copiedIndexContent) {
    fs.writeFileSync(copiedIndexPath, options.copiedIndexContent, 'utf8');
  }

  return {
    copiedIndexPath,
    pointerIndexPath,
    reportPath,
    templatePath,
  };
}

function buildDailyEvidenceTemplate(dayCount = 1) {
  return buildEvidenceIndexMarkdown({
    headingLines: DAILY_EVIDENCE_TEMPLATE_LINES,
    dayCount,
  });
}

function buildCopiedDailyEvidenceIndex(dayCount = 1) {
  return buildEvidenceIndexMarkdown({
    headingLines: [
      '# Pilot Evidence Index — pilot-ks-week-1',
      '',
      ...DAILY_EVIDENCE_TEMPLATE_LINES,
    ],
    dayCount,
  });
}

function buildCopiedDailyEvidenceIndexWithRows(rows, dayCount = rows.length) {
  const content = buildCopiedDailyEvidenceIndex(dayCount);
  const lines = content.split('\n');

  for (const row of rows) {
    const dayIndex = lines.findIndex(line => line.startsWith(`| ${row.day} `));
    if (dayIndex === -1) {
      continue;
    }
    lines[dayIndex] = [
      '|',
      ` ${row.day} `,
      '|',
      ` ${row.date ?? ''} `,
      '|',
      ` ${row.owner ?? ''} `,
      '|',
      ` ${row.status ?? ''} `,
      '|',
      ` ${row.reportPath ?? ''} `,
      '|',
      ` ${row.bundlePath ?? ''} `,
      '|',
      ` ${row.incidentCount ?? ''} `,
      '|',
      ` ${row.highestSeverity ?? ''} `,
      '|',
      ` ${row.decision ?? ''} `,
      '|',
    ].join('');
  }

  return lines.join('\n');
}

function buildCadenceDailyRow(day, overrides = {}) {
  return {
    day,
    date: `2026-03-${String(14 + day).padStart(2, '0')}`,
    owner: 'Admin KS',
    status: 'green',
    reportPath: DEFAULT_PILOT_REPORT_PATH,
    bundlePath: 'n/a',
    incidentCount: '0',
    highestSeverity: 'none',
    decision: 'continue',
    ...overrides,
  };
}

function buildCadencePointerIndexContent(pilotId = PILOT_ID) {
  return [
    'run_id,pilot_id,env_name,gate_suite,generated_at,release_verdict,report_path,evidence_index_path,legacy_log_path',
    `pilot-entry-20260315T101112Z-${pilotId},${pilotId},production,all,2026-03-15T10:11:12.000Z,GO,${DEFAULT_PILOT_REPORT_PATH},docs/pilot/PILOT_EVIDENCE_INDEX_${pilotId}.md,`,
    '',
  ].join('\n');
}

function setupCadenceFixture(tempDir, rows, dayCount = Math.max(rows.length, 1)) {
  return setupPilotArtifactFixture(tempDir, {
    templateContent: buildDailyEvidenceTemplate(dayCount),
    pointerIndexContent: buildCadencePointerIndexContent(),
    copiedIndexContent: buildCopiedDailyEvidenceIndexWithRows(rows, dayCount),
  });
}

function buildEvidenceIndexMarkdown({ headingLines, dayCount }) {
  return [
    ...headingLines,
    ...Array.from({ length: dayCount }, (_, index) => `| ${index + 1} | | | | | | | | |`),
    '',
    '## Observability Evidence Log',
    '',
    `| ${OBSERVABILITY_HEADERS.join(' | ')} |`,
    OBSERVABILITY_SEPARATOR_LINE,
    '',
    '## Decision Proof Log',
    '',
    `| ${CANONICAL_DECISION_PROOF_HEADERS.join(' | ')} |`,
    DECISION_PROOF_SEPARATOR_LINE,
    '',
  ].join('\n');
}

function createPilotEntryFixture(tempDir, options = {}) {
  const fixture = setupPilotArtifactFixture(tempDir, {
    ...options,
    templateContent: options.templateContent ?? buildDailyEvidenceTemplate(options.dayCount ?? 1),
  });

  createPilotEntryArtifacts({
    rootDir: tempDir,
    pilotId: PILOT_ID,
    envName: 'production',
    suite: 'all',
    generatedAt: options.generatedAt ?? PILOT_GENERATED_AT,
    reportPath: fixture.reportPath,
    releaseVerdict: options.releaseVerdict ?? 'GO',
    releaseGateTemplatePath: fixture.templatePath,
    pilotEvidenceIndexCsvPath: fixture.pointerIndexPath,
  });

  return fixture;
}

function buildDailyEvidenceArgs(overrides = {}) {
  return {
    pilotId: PILOT_ID,
    day: 1,
    date: '2026-03-15',
    owner: 'Admin KS',
    status: 'green',
    incidentCount: 0,
    highestSeverity: 'none',
    decision: 'continue',
    bundlePath: 'n/a',
    ...overrides,
  };
}

function buildDecisionProofArgs(overrides = {}) {
  return {
    rootDir: '',
    pilotId: PILOT_ID,
    reviewType: 'daily',
    reference: 'day-1',
    date: '2026-03-15',
    owner: 'Admin KS',
    decision: 'continue',
    rollbackTarget: 'n/a',
    observabilityReference: '',
    pilotEvidenceIndexCsvPath: '',
    ...overrides,
  };
}

function buildObservabilityEvidenceArgs(overrides = {}) {
  return {
    rootDir: '',
    pilotId: PILOT_ID,
    reference: 'day-1',
    date: '2026-03-15',
    owner: 'Admin KS',
    logSweepResult: 'expected-noise',
    functionalErrorCount: 0,
    expectedAuthDenyCount: 2,
    kpiCondition: 'within-threshold',
    incidentCount: 0,
    highestSeverity: 'none',
    notes: 'n/a',
    pilotEvidenceIndexCsvPath: '',
    ...overrides,
  };
}

module.exports = {
  CANONICAL_DECISION_PROOF_HEADERS,
  CANONICAL_OBSERVABILITY_EVIDENCE_HEADERS,
  CANONICAL_OBSERVABILITY_EVIDENCE_SEPARATOR,
  createPilotEntryArtifacts,
  evaluatePilotReadinessCadence,
  parsePilotEvidenceIndex,
  recordPilotDailyEvidence,
  recordPilotDecisionProof,
  recordPilotObservabilityEvidence,
  createPilotDailyEvidenceArgs,
  parsePilotDailyEvidenceArgs,
  createPilotDecisionArgs,
  parsePilotDecisionArgs,
  createPilotObservabilityArgs,
  parsePilotObservabilityArgs,
  createPilotCadenceArgs,
  parsePilotCadenceArgs,
  PILOT_ID,
  PILOT_GENERATED_AT,
  DEFAULT_PILOT_REPORT_PATH,
  DAILY_EVIDENCE_TEMPLATE_LINES,
  OBSERVABILITY_HEADERS,
  OBSERVABILITY_SEPARATOR_LINE,
  DECISION_PROOF_SEPARATOR_LINE,
  withTempDir,
  setupPilotArtifactFixture,
  buildDailyEvidenceTemplate,
  buildCopiedDailyEvidenceIndex,
  buildCopiedDailyEvidenceIndexWithRows,
  buildCadenceDailyRow,
  buildCadencePointerIndexContent,
  setupCadenceFixture,
  buildEvidenceIndexMarkdown,
  createPilotEntryFixture,
  buildDailyEvidenceArgs,
  buildDecisionProofArgs,
  buildObservabilityEvidenceArgs,
};
