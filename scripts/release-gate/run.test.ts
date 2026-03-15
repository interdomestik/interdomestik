import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const {
  buildCommercialPromiseScenarios,
  buildFreeStartGroupPrivacyScenarios,
  buildRouteAllowingLocalePath,
  classifyInfraNetworkFailure,
  computeRetryDelayMs,
  evaluateCredentialPreflightResults,
  enforceNoSkipOnSelectedChecks,
  findMissingBoundaryPhrases,
  findMissingCommercialPromiseSections,
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
const { writeReleaseGateReport } = require('./report.ts');
const { checkPortalMarkers } = require('./shared.ts');
const { REQUIRED_ENV_BY_SUITE, SELECTORS } = require('./config.ts');

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
  assert.equal(isLoginDependentCheck('P1.5.1'), false);
});

test('resolveAccountPasswordVar reuses the agent password for office agents', () => {
  assert.equal(resolveAccountPasswordVar('office_agent'), 'RELEASE_GATE_AGENT_PASSWORD');
  assert.equal(resolveAccountPasswordVar('member'), 'RELEASE_GATE_MEMBER_PASSWORD');
});

test('p6 suite requires member credentials plus office-agent email and shared agent password', () => {
  assert.deepEqual(REQUIRED_ENV_BY_SUITE.p6, [
    'RELEASE_GATE_MEMBER_EMAIL',
    'RELEASE_GATE_MEMBER_PASSWORD',
    'RELEASE_GATE_OFFICE_AGENT_EMAIL',
    'RELEASE_GATE_AGENT_PASSWORD',
  ]);
});

test('buildCommercialPromiseScenarios covers the published commercial surfaces for G07', () => {
  const scenarios = buildCommercialPromiseScenarios({
    baseUrl: 'https://interdomestik-web.vercel.app',
    locale: 'en',
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
        url: 'https://interdomestik-web.vercel.app/en/pricing',
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
        url: 'https://interdomestik-web.vercel.app/en/register',
        requiredTestIds: [
          'register-success-fee-calculator',
          'register-billing-terms',
          'register-coverage-matrix',
        ],
      },
      {
        id: 'services',
        account: null,
        url: 'https://interdomestik-web.vercel.app/en/services',
        requiredTestIds: ['services-commercial-disclaimers', 'services-coverage-matrix'],
      },
      {
        id: 'membership',
        account: 'member',
        url: 'https://interdomestik-web.vercel.app/en/member/membership',
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
    baseUrl: 'https://interdomestik-web.vercel.app',
    locale: 'en',
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
        url: 'https://interdomestik-web.vercel.app/en/',
        requiredTestIds: ['free-start-triage-note'],
      },
      {
        id: 'group_dashboard',
        account: 'office_agent',
        url: 'https://interdomestik-web.vercel.app/en/agent/import',
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

test('writeReleaseGateReport includes the G07 and G08 RC sections', () => {
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
      executedChecks: ['P0.1', 'G07', 'G08'],
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
    assert.match(report, /\*\*Result:\*\* FAIL/);
    assert.match(report, /pricing missing=pricing-billing-terms/);
    assert.match(report, /G07_COMMERCIAL_PROMISE_SURFACE_MISSING/);
    assert.match(report, /group dashboard leaked member name/);
    assert.match(report, /G08_PRIVACY_LEAK_DETECTED/);
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
