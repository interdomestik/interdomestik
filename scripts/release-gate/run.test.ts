import assert from 'node:assert/strict';
import test from 'node:test';

const {
  buildRouteAllowingLocalePath,
  classifyInfraNetworkFailure,
  computeRetryDelayMs,
  evaluateCredentialPreflightResults,
  enforceNoSkipOnSelectedChecks,
  isLoginDependentCheck,
  isLegacyVercelLogsArgsUnsupported,
  parseVercelRuntimeJsonLines,
  parseRetryAfterSeconds,
  resolveReachableBaseUrl,
  resolveTenantOverrideProbeUrl,
  sessionCacheKeyForAccount,
  shouldDisallowSkippedChecks,
} = require('./run.ts');
const { checkPortalMarkers } = require('./shared.ts');
const { SELECTORS } = require('./config.ts');

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
  assert.equal(isLoginDependentCheck('P1.5.1'), false);
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
