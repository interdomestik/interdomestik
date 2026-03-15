import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const {
  buildCommercialPromiseScenarios,
  buildEscalationAgreementCollectionFallbackScenarios,
  buildFreeStartGroupPrivacyScenarios,
  buildMatterAndSlaEnforcementScenarios,
  buildRouteAllowingLocalePath,
  classifyInfraNetworkFailure,
  computeRetryDelayMs,
  evaluateCredentialPreflightResults,
  enforceNoSkipOnSelectedChecks,
  findMissingBoundaryPhrases,
  findMissingCommercialPromiseSections,
  findMismatchedMatterAllowanceValues,
  findPresentBoundaryLeaks,
  isLoginDependentCheck,
  isLegacyVercelLogsArgsUnsupported,
  parseVercelRuntimeJsonLines,
  parseRetryAfterSeconds,
  resolveAccountPasswordVar,
  resolveReachableBaseUrl,
  resolveTenantOverrideProbeUrl,
  sessionCacheKeyForAccount,
  shouldDisallowSkippedChecks,
} = require('./run.ts');
const {
  CANONICAL_DECISION_PROOF_HEADERS,
  createPilotEntryArtifacts,
  parsePilotEvidenceIndex,
  recordPilotDailyEvidence,
  recordPilotDecisionProof,
} = require('./pilot-artifacts.ts');
const {
  createEmptyArgs: createPilotDailyEvidenceArgs,
  parseArgs: parsePilotDailyEvidenceArgs,
} = require('../pilot-daily-evidence.ts');
const {
  createEmptyArgs: createPilotDecisionArgs,
  parseArgs: parsePilotDecisionArgs,
} = require('../pilot-decision-proof.ts');
const { writeReleaseGateReport } = require('./report.ts');
const { checkPortalMarkers, resolveForwardedForIp } = require('./shared.ts');
const { REQUIRED_ENV_BY_SUITE, ROLE_IPS, SELECTORS } = require('./config.ts');

const RELEASE_GATE_BASE_URL = 'https://interdomestik-web.vercel.app';
const RELEASE_GATE_LOCALE = 'en';
const DEFAULT_MATTER_ALLOWANCE = { used: '0', remaining: '2', total: '2' };
const PILOT_ID = 'pilot-ks-week-1';
const PILOT_GENERATED_AT = new Date('2026-03-15T10:11:12.000Z');
const DEFAULT_PILOT_REPORT_PATH = 'docs/release-gates/2026-03-15_production_dpl_demo.md';
const DAILY_EVIDENCE_TEMPLATE_LINES = [
  '# Pilot Evidence Index Template',
  '',
  '| Day | Date (YYYY-MM-DD) | Owner | Status (`green`/`amber`/`red`) | Release Report Path | Evidence Bundle Path | Incidents (count) | Highest Sev (`none`/`sev3`/`sev2`/`sev1`) | Decision (`continue`/`pause`/`hotfix`/`stop`) |',
  '| --- | ----------------- | ----- | ------------------------------ | ------------------- | -------------------- | ----------------- | ----------------------------------------- | --------------------------------------------- |',
];
const DECISION_PROOF_SEPARATOR_LINE =
  '| ------------------------------- | --------- | ----------------- | ----- | ---------------------------------------------- | ----------------------------------------------- | ------------------------------------ | --------------------------------------------------------------- |';

const ORIGINAL_DISALLOW_SKIP = process.env.RELEASE_GATE_DISALLOW_SKIP;
const ORIGINAL_REQUIRE_ROLE_PANEL = process.env.RELEASE_GATE_REQUIRE_ROLE_PANEL;

function restoreDisallowSkipEnv() {
  if (ORIGINAL_DISALLOW_SKIP === undefined) {
    delete process.env.RELEASE_GATE_DISALLOW_SKIP;
  } else {
    process.env.RELEASE_GATE_DISALLOW_SKIP = ORIGINAL_DISALLOW_SKIP;
  }
}

function restoreRequireRolePanelEnv() {
  if (ORIGINAL_REQUIRE_ROLE_PANEL === undefined) {
    delete process.env.RELEASE_GATE_REQUIRE_ROLE_PANEL;
  } else {
    process.env.RELEASE_GATE_REQUIRE_ROLE_PANEL = ORIGINAL_REQUIRE_ROLE_PANEL;
  }
}

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

function buildEvidenceIndexMarkdown({ headingLines, dayCount }) {
  return [
    ...headingLines,
    ...Array.from({ length: dayCount }, (_, index) => `| ${index + 1} | | | | | | | | |`),
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
    pilotEvidenceIndexCsvPath: '',
    ...overrides,
  };
}

test('parseRetryAfterSeconds parses integer seconds value', () => {
  assert.equal(parseRetryAfterSeconds('15', 0), 15);
});

test('parseRetryAfterSeconds parses HTTP date values', () => {
  const nowMs = Date.parse('2026-02-21T00:00:00.000Z');
  const retryAt = new Date(nowMs + 6_000).toUTCString();
  assert.equal(parseRetryAfterSeconds(retryAt, nowMs), 6);
});

test('computeRetryDelayMs keeps jitter within expected bounds', () => {
  const minDelay = computeRetryDelayMs({
    attempt: 1,
    retryAfterSeconds: 2,
    randomFn: () => 0,
  });
  const maxDelay = computeRetryDelayMs({
    attempt: 1,
    retryAfterSeconds: 2,
    randomFn: () => 0.999999,
  });

  assert.equal(minDelay.baseMs, 2_000);
  assert.equal(minDelay.jitterMs, 100);
  assert.equal(maxDelay.jitterMs, 350);
  assert.equal(minDelay.totalMs, 2_100);
  assert.equal(maxDelay.totalMs, 2_350);
});

test('sessionCacheKeyForAccount keys cache by account label', () => {
  assert.equal(sessionCacheKeyForAccount('admin_ks'), 'Admin-(KS)');
  assert.equal(sessionCacheKeyForAccount('member'), 'Member-only');
});

test('buildRouteAllowingLocalePath avoids duplicate locale prefixes', () => {
  const baseUrl = 'https://interdomestik-web.vercel.app';
  assert.equal(
    buildRouteAllowingLocalePath(baseUrl, 'en', '/en/staff/claims/claim_123'),
    'https://interdomestik-web.vercel.app/en/staff/claims/claim_123'
  );
  assert.equal(
    buildRouteAllowingLocalePath(baseUrl, 'en', '/staff/claims/claim_123'),
    'https://interdomestik-web.vercel.app/en/staff/claims/claim_123'
  );
});

test('buildRouteAllowingLocalePath handles edge cases', () => {
  const baseUrl = 'https://interdomestik-web.vercel.app';

  // 1) Absolute URL should be returned as-is
  assert.equal(
    buildRouteAllowingLocalePath(baseUrl, 'en', 'https://example.com/path'),
    'https://example.com/path'
  );

  // 2) Path without leading slash should be normalized
  assert.equal(
    buildRouteAllowingLocalePath(baseUrl, 'en', 'staff/claims/claim_123'),
    'https://interdomestik-web.vercel.app/en/staff/claims/claim_123'
  );

  // 3) Just the locale path should not get duplicated
  assert.equal(
    buildRouteAllowingLocalePath(baseUrl, 'en', '/en'),
    'https://interdomestik-web.vercel.app/en'
  );

  // 4) Different locale should behave the same way
  assert.equal(
    buildRouteAllowingLocalePath(baseUrl, 'fr', '/dashboard'),
    'https://interdomestik-web.vercel.app/fr/dashboard'
  );
});

test('checkPortalMarkers treats Next fallback 404 template as not-found marker', async () => {
  const page = {
    getByTestId(testId) {
      return {
        isVisible: async () => false,
      };
    },
    locator(selector) {
      return {
        isVisible: async () => selector === SELECTORS.userRolesTable,
        count: async () => (selector === SELECTORS.notFoundFallbackTemplate ? 1 : 0),
      };
    },
  };

  const markers = await checkPortalMarkers(page);
  assert.equal(markers.notFound, true);
  assert.equal(markers.rolesTable, true);
});

test('isLegacyVercelLogsArgsUnsupported detects removed --environment flag support', () => {
  const unsupportedOutput = 'Error: unknown or unexpected option: --environment';
  assert.equal(isLegacyVercelLogsArgsUnsupported(unsupportedOutput), true);
  assert.equal(isLegacyVercelLogsArgsUnsupported('vercel logs exited 0'), false);
});

test('parseVercelRuntimeJsonLines keeps valid JSON entries and ignores banner noise', () => {
  const payload = [
    'Vercel CLI 48.10.2',
    '{"level":"error","message":"upload failed"}',
    'Fetching deployment...',
    '{"level":"info","message":"ready"}',
  ].join('\n');

  const entries = parseVercelRuntimeJsonLines(payload);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].level, 'error');
  assert.equal(entries[0].message, 'upload failed');
  assert.equal(entries[1].level, 'info');
  assert.equal(entries[1].message, 'ready');
});

test('classifyInfraNetworkFailure identifies transport-level outages', () => {
  const timeoutMessage = 'apiRequestContext.post: Timeout 30000ms exceeded.';
  const refusedMessage = 'connect ECONNREFUSED 64.29.17.195:443';
  const logicError = 'P1.3_DETAIL_READY_MARKER_MISSING';

  assert.ok(classifyInfraNetworkFailure(timeoutMessage));
  assert.ok(classifyInfraNetworkFailure(refusedMessage));
  assert.equal(classifyInfraNetworkFailure(logicError), null);
});

test('isLoginDependentCheck maps suites to auth-dependent checks', () => {
  assert.equal(isLoginDependentCheck('P1.1'), true);
  assert.equal(isLoginDependentCheck('P1.3'), true);
  assert.equal(isLoginDependentCheck('G07'), true);
  assert.equal(isLoginDependentCheck('G08'), true);
  assert.equal(isLoginDependentCheck('G09'), true);
  assert.equal(isLoginDependentCheck('G10'), true);
  assert.equal(isLoginDependentCheck('P1.5.1'), false);
});

test('resolveAccountPasswordVar reuses the agent password for office agents', () => {
  assert.equal(resolveAccountPasswordVar('office_agent'), 'RELEASE_GATE_AGENT_PASSWORD');
  assert.equal(resolveAccountPasswordVar('member'), 'RELEASE_GATE_MEMBER_PASSWORD');
});

test('office-agent release-gate traffic resolves to the agent source IP', () => {
  assert.equal(resolveForwardedForIp('office_agent'), ROLE_IPS.agent);
});

test('p6 suite requires member, office-agent, and staff credentials for G07 to G10', () => {
  assert.deepEqual(REQUIRED_ENV_BY_SUITE.p6, [
    'RELEASE_GATE_MEMBER_EMAIL',
    'RELEASE_GATE_MEMBER_PASSWORD',
    'RELEASE_GATE_OFFICE_AGENT_EMAIL',
    'RELEASE_GATE_AGENT_PASSWORD',
    'RELEASE_GATE_STAFF_EMAIL',
    'RELEASE_GATE_STAFF_PASSWORD',
  ]);
});

test('buildCommercialPromiseScenarios covers the published commercial surfaces for G07', () => {
  const scenarios = buildCommercialPromiseScenarios({
    baseUrl: RELEASE_GATE_BASE_URL,
    locale: RELEASE_GATE_LOCALE,
  });

  assert.deepEqual(
    scenarios.map(scenario => ({
      id: scenario.id,
      account: scenario.account,
      url: scenario.url,
      requiredTestIds: scenario.requiredTestIds,
    })),
    [
      {
        id: 'pricing',
        account: null,
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/pricing`,
        requiredTestIds: [
          'pricing-commercial-disclaimers',
          'pricing-success-fee-calculator',
          'pricing-billing-terms',
          'pricing-coverage-matrix',
        ],
      },
      {
        id: 'register',
        account: null,
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/register`,
        requiredTestIds: [
          'register-success-fee-calculator',
          'register-billing-terms',
          'register-coverage-matrix',
        ],
      },
      {
        id: 'services',
        account: null,
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/services`,
        requiredTestIds: ['services-commercial-disclaimers', 'services-coverage-matrix'],
      },
      {
        id: 'membership',
        account: 'member',
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/member/membership`,
        requiredTestIds: ['membership-commercial-disclaimers', 'membership-coverage-matrix'],
      },
    ]
  );
});

test('findMissingCommercialPromiseSections reports only the absent required sections', () => {
  const missing = findMissingCommercialPromiseSections(
    ['pricing-commercial-disclaimers', 'pricing-success-fee-calculator', 'pricing-coverage-matrix'],
    {
      'pricing-commercial-disclaimers': true,
      'pricing-success-fee-calculator': false,
      'pricing-coverage-matrix': true,
    }
  );

  assert.deepEqual(missing, ['pricing-success-fee-calculator']);
});

test('buildFreeStartGroupPrivacyScenarios covers the public and office-boundary surfaces for G08', () => {
  const scenarios = buildFreeStartGroupPrivacyScenarios({
    baseUrl: RELEASE_GATE_BASE_URL,
    locale: RELEASE_GATE_LOCALE,
  });

  assert.deepEqual(
    scenarios.map(scenario => ({
      id: scenario.id,
      account: scenario.account,
      url: scenario.url,
      requiredTestIds: scenario.requiredTestIds,
    })),
    [
      {
        id: 'free_start',
        account: null,
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/`,
        requiredTestIds: ['free-start-triage-note'],
      },
      {
        id: 'group_dashboard',
        account: 'office_agent',
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/agent/import`,
        requiredTestIds: ['group-dashboard-summary'],
      },
    ]
  );
});

test('findMissingBoundaryPhrases reports only the absent required privacy phrases', () => {
  const missing = findMissingBoundaryPhrases(
    [
      'Free Start stays informational',
      'hotline stays routing-only',
      'Aggregate group access dashboard',
    ],
    'Free Start stays informational and the hotline stays routing-only.'
  );

  assert.deepEqual(missing, ['Aggregate group access dashboard']);
});

test('findPresentBoundaryLeaks reports member-identifying text that should stay hidden', () => {
  const leaks = findPresentBoundaryLeaks(
    ['KS A-Member 1', 'member.ks.a1@interdomestik.com'],
    'Aggregate group access dashboard KS A-Member 1 remains visible here.'
  );

  assert.deepEqual(leaks, ['KS A-Member 1']);
});

test('buildMatterAndSlaEnforcementScenarios covers the deterministic member and staff claim surfaces for G09', () => {
  const scenarios = buildMatterAndSlaEnforcementScenarios({
    baseUrl: RELEASE_GATE_BASE_URL,
    locale: RELEASE_GATE_LOCALE,
  });

  assert.deepEqual(
    scenarios.map(({ id, account, url, requiredPhrases }) => ({
      id,
      account,
      url,
      requiredPhrases,
    })),
    [
      {
        id: 'member_running',
        account: 'member',
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/member/claims/golden_ks_a_claim_05`,
        requiredPhrases: ['SLA Status', 'Response timer is running.'],
      },
      {
        id: 'member_incomplete',
        account: 'member',
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/member/claims/golden_ks_a_claim_13`,
        requiredPhrases: ['SLA Status', 'Waiting for your information before the SLA starts.'],
      },
      {
        id: 'staff_running',
        account: 'staff',
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/staff/claims/golden_ks_a_claim_05`,
        requiredPhrases: ['SLA Status', 'Running'],
      },
      {
        id: 'staff_incomplete',
        account: 'staff',
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/staff/claims/golden_ks_a_claim_13`,
        requiredPhrases: ['SLA Status', 'Waiting for member information'],
      },
    ]
  );

  for (const scenario of scenarios) {
    const isStaffSurface = scenario.account === 'staff';
    const prefix = isStaffSurface ? 'staff-claim-detail' : 'member-claim';
    const expectedTestIds = [
      ...(isStaffSurface ? [`${prefix}-ready`] : []),
      `${prefix}-matter-allowance`,
      `${prefix}-matter-allowance-used`,
      `${prefix}-matter-allowance-remaining`,
      `${prefix}-matter-allowance-total`,
    ];

    assert.deepEqual(scenario.requiredTestIds, expectedTestIds);
    assert.deepEqual(scenario.expectedMatterAllowance, DEFAULT_MATTER_ALLOWANCE);
  }
});

test('buildEscalationAgreementCollectionFallbackScenarios covers deterministic accepted-case staff surfaces for G10', () => {
  const scenarios = buildEscalationAgreementCollectionFallbackScenarios({
    baseUrl: RELEASE_GATE_BASE_URL,
    locale: RELEASE_GATE_LOCALE,
  });

  assert.deepEqual(
    scenarios.map(({ id, account, url, requiredPhrases, requiredPrerequisitePhrases }) => ({
      id,
      account,
      url,
      requiredPrerequisitePhrases,
      requiredPhrases,
    })),
    [
      {
        id: 'staff_unsigned_agreement',
        account: 'staff',
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/staff/claims/golden_ks_a_claim_14`,
        requiredPrerequisitePhrases: ['Agreement Missing', 'Collection path Missing'],
        requiredPhrases: [
          'Accepted recovery prerequisites',
          'Save the accepted escalation agreement before moving this case into negotiation or court.',
        ],
      },
      {
        id: 'staff_signed_deduction',
        account: 'staff',
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/staff/claims/golden_ks_a_claim_15`,
        requiredPrerequisitePhrases: ['Agreement Ready', 'Collection path Ready'],
        requiredPhrases: [
          'Payment authorization',
          'authorized',
          'Terms version',
          '2026-03-v1',
          'Deduct from payout',
        ],
      },
      {
        id: 'staff_payment_method_fallback',
        account: 'staff',
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/staff/claims/golden_ks_a_claim_17`,
        requiredPrerequisitePhrases: ['Agreement Ready', 'Collection path Ready'],
        requiredPhrases: ['Charge stored payment method', 'Stored payment method', 'Yes'],
      },
      {
        id: 'staff_invoice_fallback',
        account: 'staff',
        url: `${RELEASE_GATE_BASE_URL}/${RELEASE_GATE_LOCALE}/staff/claims/golden_ks_a_claim_16`,
        requiredPrerequisitePhrases: ['Agreement Ready', 'Collection path Ready'],
        requiredPhrases: ['Invoice fallback', 'Stored payment method', 'No', 'Invoice due'],
      },
    ]
  );

  for (const scenario of scenarios) {
    assert.deepEqual(scenario.requiredTestIds, [
      'staff-claim-detail-ready',
      'staff-accepted-recovery-prerequisites',
      'staff-escalation-agreement-summary',
      'staff-success-fee-collection-summary',
    ]);
  }
});

test('findMismatchedMatterAllowanceValues reports only the mismatched counters', () => {
  const mismatches = findMismatchedMatterAllowanceValues(
    { used: '0', remaining: '2', total: '2' },
    { used: '0', remaining: '1', total: '2' }
  );

  assert.deepEqual(mismatches, ['remaining expected=2 actual=1']);
});

test('shouldDisallowSkippedChecks defaults to true for production and false otherwise', () => {
  delete process.env.RELEASE_GATE_DISALLOW_SKIP;
  try {
    assert.equal(shouldDisallowSkippedChecks('production'), true);
    assert.equal(shouldDisallowSkippedChecks('staging'), false);
  } finally {
    restoreDisallowSkipEnv();
  }
});

test('shouldDisallowSkippedChecks supports explicit env override', () => {
  try {
    process.env.RELEASE_GATE_DISALLOW_SKIP = 'false';
    assert.equal(shouldDisallowSkippedChecks('production'), false);

    process.env.RELEASE_GATE_DISALLOW_SKIP = '1';
    assert.equal(shouldDisallowSkippedChecks('staging'), true);
  } finally {
    restoreDisallowSkipEnv();
  }
});

test('enforceNoSkipOnSelectedChecks promotes skipped or missing checks to FAIL when disallowed', () => {
  delete process.env.RELEASE_GATE_DISALLOW_SKIP;
  try {
    const checks = [
      { id: 'P0.1', status: 'PASS', evidence: ['ok'], signatures: [] },
      { id: 'P1.1', status: 'SKIPPED', evidence: ['N/A'], signatures: ['P1.1_PRECONDITION'] },
    ];
    const selected = ['P0.1', 'P1.1', 'P1.2'];
    const normalized = enforceNoSkipOnSelectedChecks(checks, selected, 'production');

    const p11 = normalized.find(check => check.id === 'P1.1');
    const p12 = normalized.find(check => check.id === 'P1.2');

    assert.equal(p11.status, 'FAIL');
    assert.ok(p11.signatures.includes('P1.1_PRECONDITION'));
    assert.ok(p11.signatures.includes('P1.1_SKIPPED_NOT_ALLOWED'));
    assert.equal(p11.evidence[p11.evidence.length - 1], 'skip_policy=disallowed env=production');

    assert.equal(p12.status, 'FAIL');
    assert.ok(p12.signatures.includes('P1.2_NOT_EXECUTED'));
  } finally {
    restoreDisallowSkipEnv();
  }
});

test('enforceNoSkipOnSelectedChecks keeps skipped checks when skip policy is disabled', () => {
  try {
    process.env.RELEASE_GATE_DISALLOW_SKIP = '0';

    const checks = [{ id: 'P1.3', status: 'SKIPPED', evidence: ['N/A'], signatures: [] }];
    const normalized = enforceNoSkipOnSelectedChecks(checks, ['P1.3'], 'production');

    assert.equal(normalized[0].status, 'SKIPPED');
  } finally {
    restoreDisallowSkipEnv();
  }
});

test('enforceNoSkipOnSelectedChecks allows P0.3/P0.4 skip when role panel checks are disabled', () => {
  delete process.env.RELEASE_GATE_DISALLOW_SKIP;
  process.env.RELEASE_GATE_REQUIRE_ROLE_PANEL = 'false';
  try {
    const checks = [
      { id: 'P0.3', status: 'SKIPPED', evidence: ['N/A'], signatures: [] },
      { id: 'P0.4', status: 'SKIPPED', evidence: ['N/A'], signatures: [] },
    ];
    const normalized = enforceNoSkipOnSelectedChecks(checks, ['P0.3', 'P0.4'], 'production');

    const p03 = normalized.find(check => check.id === 'P0.3');
    const p04 = normalized.find(check => check.id === 'P0.4');
    assert.equal(p03.status, 'SKIPPED');
    assert.equal(p04.status, 'SKIPPED');
    assert.ok(!p03.signatures.includes('P0.3_SKIPPED_NOT_ALLOWED'));
    assert.ok(!p04.signatures.includes('P0.4_SKIPPED_NOT_ALLOWED'));
    assert.equal(
      p03.evidence[p03.evidence.length - 1],
      'skip_policy=allowed reason=RELEASE_GATE_REQUIRE_ROLE_PANEL=false'
    );
    assert.equal(
      p04.evidence[p04.evidence.length - 1],
      'skip_policy=allowed reason=RELEASE_GATE_REQUIRE_ROLE_PANEL=false'
    );
  } finally {
    restoreDisallowSkipEnv();
    restoreRequireRolePanelEnv();
  }
});

test('resolveTenantOverrideProbeUrl uses configured RELEASE_GATE_MK_USER_URL when provided', () => {
  const original = process.env.RELEASE_GATE_MK_USER_URL;
  try {
    process.env.RELEASE_GATE_MK_USER_URL = '/en/admin/users/custom-tenant-user?tenantId=tenant_mk';
    const resolved = resolveTenantOverrideProbeUrl({
      baseUrl: 'https://interdomestik-web.vercel.app',
      locale: 'en',
    });
    assert.equal(resolved.source, 'env');
    assert.equal(
      resolved.url,
      'https://interdomestik-web.vercel.app/en/admin/users/custom-tenant-user?tenantId=tenant_mk'
    );
  } finally {
    if (original === undefined) {
      delete process.env.RELEASE_GATE_MK_USER_URL;
    } else {
      process.env.RELEASE_GATE_MK_USER_URL = original;
    }
  }
});

test('writeReleaseGateReport includes the G07 to G10 RC sections', () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-gate-report-'));

  try {
    const result = writeReleaseGateReport({
      outDir,
      envName: 'production',
      baseUrl: 'https://interdomestik-web.vercel.app',
      suite: 'all',
      deploymentId: 'dpl_test123',
      deploymentUrl: 'https://interdomestik-web-g07.vercel.app',
      deploymentSource: 'unit-test',
      generatedAt: new Date('2026-03-15T12:00:00.000Z'),
      executedChecks: ['P0.1', 'G07', 'G08', 'G09', 'G10'],
      checks: [
        { id: 'P0.1', status: 'PASS', evidence: ['rbac ok'], signatures: [] },
        {
          id: 'G07',
          status: 'FAIL',
          evidence: ['pricing missing=pricing-billing-terms'],
          signatures: [
            'G07_COMMERCIAL_PROMISE_SURFACE_MISSING scenario=pricing missing=pricing-billing-terms',
          ],
        },
        {
          id: 'G08',
          status: 'FAIL',
          evidence: ['group dashboard leaked member name'],
          signatures: ['G08_PRIVACY_LEAK_DETECTED scenario=group_dashboard leaks=KS A-Member 1'],
        },
        {
          id: 'G09',
          status: 'FAIL',
          evidence: ['staff running allowance mismatch'],
          signatures: [
            'G09_MATTER_ALLOWANCE_MISMATCH scenario=staff_running remaining expected=2 actual=1',
          ],
        },
        {
          id: 'G10',
          status: 'FAIL',
          evidence: ['invoice fallback summary missing'],
          signatures: [
            'G10_COLLECTION_FALLBACK_COPY_MISSING scenario=staff_invoice_fallback missing=Invoice fallback',
          ],
        },
      ],
      accounts: {
        member: 'member@example.com',
        agent: 'agent@example.com',
        officeAgent: 'office.agent@example.com',
        staff: 'staff@example.com',
        adminKs: 'admin.ks@example.com',
        adminMk: 'admin.mk@example.com',
      },
      preconditions: {
        migrations: 'not evaluated',
        env: 'vars present',
        flags: 'none',
      },
    });

    const report = fs.readFileSync(result.reportPath, 'utf8');
    assert.match(report, /Office agent: \[REDACTED_EMAIL\]/);
    assert.match(report, /## G07 Commercial Promise Surfaces/);
    assert.match(report, /## G08 Free Start And Group Privacy Boundaries/);
    assert.match(report, /## G09 Matter And SLA Enforcement/);
    assert.match(report, /## G10 Escalation Agreement And Collection Fallback/);
    assert.match(report, /\*\*Result:\*\* FAIL/);
    assert.match(report, /pricing missing=pricing-billing-terms/);
    assert.match(report, /G07_COMMERCIAL_PROMISE_SURFACE_MISSING/);
    assert.match(report, /group dashboard leaked member name/);
    assert.match(report, /G08_PRIVACY_LEAK_DETECTED/);
    assert.match(report, /staff running allowance mismatch/);
    assert.match(report, /G09_MATTER_ALLOWANCE_MISMATCH/);
    assert.match(report, /invoice fallback summary missing/);
    assert.match(report, /G10_COLLECTION_FALLBACK_COPY_MISSING/);
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('resolveTenantOverrideProbeUrl falls back to deterministic MK override probe', () => {
  const original = process.env.RELEASE_GATE_MK_USER_URL;
  try {
    delete process.env.RELEASE_GATE_MK_USER_URL;
    const resolved = resolveTenantOverrideProbeUrl({
      baseUrl: 'https://interdomestik-web.vercel.app',
      locale: 'en',
    });
    assert.equal(resolved.source, 'fallback');
    assert.equal(
      resolved.url,
      'https://interdomestik-web.vercel.app/en/admin/users/golden_mk_staff?tenantId=tenant_mk'
    );
  } finally {
    if (original === undefined) {
      delete process.env.RELEASE_GATE_MK_USER_URL;
    } else {
      process.env.RELEASE_GATE_MK_USER_URL = original;
    }
  }
});

test('resolveReachableBaseUrl keeps configured base when probe succeeds', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 200 });

  try {
    const resolved = await resolveReachableBaseUrl('https://primary.example.com', {
      deploymentUrl: 'https://deploy.example.vercel.app',
    });
    assert.equal(resolved.baseUrl, 'https://primary.example.com');
    assert.equal(resolved.source, 'configured');
    assert.equal(resolved.probeStatus, 200);
    assert.equal(resolved.failures.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveReachableBaseUrl falls back to deployment URL when configured base is unreachable', async () => {
  const originalFetch = globalThis.fetch;
  let attempt = 0;
  globalThis.fetch = async () => {
    attempt += 1;
    if (attempt === 1) {
      throw new Error('connect ECONNREFUSED primary.example.com:443');
    }
    return new Response('', { status: 200 });
  };

  try {
    const resolved = await resolveReachableBaseUrl('https://primary.example.com', {
      deploymentUrl: 'https://deploy.example.vercel.app',
    });
    assert.equal(resolved.baseUrl, 'https://deploy.example.vercel.app');
    assert.equal(resolved.source, 'deployment_fallback');
    assert.equal(resolved.probeStatus, 200);
    assert.ok(resolved.failures[0].includes('probe_failed candidate=https://primary.example.com'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('evaluateCredentialPreflightResults flags all-auth-denied status sets as misconfiguration', () => {
  const evaluation = evaluateCredentialPreflightResults([
    { accountKey: 'member', status: 401 },
    { accountKey: 'agent', status: 401 },
    { accountKey: 'staff', status: 403 },
  ]);

  assert.equal(evaluation.hasSuccess, false);
  assert.equal(evaluation.allAuthDenied, true);
});

test('evaluateCredentialPreflightResults does not flag misconfiguration when any account succeeds', () => {
  const evaluation = evaluateCredentialPreflightResults([
    { accountKey: 'member', status: 401 },
    { accountKey: 'agent', status: 200 },
    { accountKey: 'staff', status: 403 },
  ]);

  assert.equal(evaluation.hasSuccess, true);
  assert.equal(evaluation.allAuthDenied, false);
});

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

test('recordPilotDecisionProof records repo-backed daily and weekly decisions in the copied evidence index', () => {
  withTempDir('pilot-decision-proof-', tempDir => {
    const fixture = createPilotEntryFixture(tempDir, { dayCount: 2 });

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
      /\| daily \| day-1 \| 2026-03-15 \| Admin KS \| pause \| n\/a \| yes \| no \|/
    );
    assert.match(
      copiedIndex,
      /\| weekly \| week-1 \| 2026-03-21 \| Admin KS \| stop \| pilot-ready-20260315 \| yes \| yes \|/
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
      /\| daily \| day-1 \| 2026-03-15 \| Admin KS \| continue \| n\/a \| no \| no \|/
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
