#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const {
  DEFAULTS,
  SUITES,
  ROUTES,
  MARKERS,
  SELECTORS,
  TIMEOUTS,
  ACCOUNTS,
  REQUIRED_ENV_BY_SUITE,
  EXPECTED_VERCEL_LOG_NOISE,
  FUNCTIONAL_LOG_ERROR_HINTS,
} = require('./config.ts');
const { writeReleaseGateReport } = require('./report.ts');
const { createPilotEntryArtifacts } = require('./pilot-artifacts.ts');
const {
  resolveConfiguredRolePanelTarget,
  resolveTenantOverrideProbeUrl,
  runP01,
  runP02,
  runP03AndP04,
  runP06,
} = require('./admin-checks.ts');
const {
  buildCommercialPromiseScenarios,
  buildEscalationAgreementCollectionFallbackScenarios,
  buildFreeStartGroupPrivacyScenarios,
  buildMatterAndSlaEnforcementScenarios,
  runG07,
  runG08,
  runG09,
  runG10,
} = require('./commercial-checks.ts');
const {
  classifyInfraNetworkFailure,
  compactErrorMessage,
  resolveConfiguredStaffClaimDetailUrl,
  runP11AndP12,
  runP13,
  selectAlternativeActionableStatus,
} = require('./product-checks.ts');
const { collectVisibleTestIds, visitReleaseGateScenario } = require('./scenario-visits.ts');
const { resolveG10Scenario } = require('./staff-claim-driver.ts');
const {
  gotoWithSessionRetry,
  loginWithRunContext,
  resolveReachableBaseUrl,
} = require('./session-navigation.ts');
const {
  buildRoute,
  buildRouteAllowingLocalePath,
  checkResult,
  computeRetryDelayMs,
  createAuthState,
  getAuthLoginCooldownMs,
  getMissingEnv,
  markerSummary,
  noteAuthRateLimit,
  normalizeBaseUrl,
  parseRetryAfterSeconds,
  recordAuthLoginAttempt,
  resolvePlaywright,
  sessionCacheKeyForAccount,
  sleep,
} = require('./shared.ts');

const VERCEL_LOG_STREAM_TIMEOUT_MS = 12_000;
const AUTH_PREFLIGHT_TIMEOUT_MS = 8_000;
const AUTH_PREFLIGHT_MAX_ATTEMPTS = 3;
const AUTH_PREFLIGHT_BACKOFF_MS = [500, 1_500, 3_000];
const AUTH_PREFLIGHT_ACCEPTED_STATUSES = new Set([200, 204, 400, 401, 403, 404, 405, 429]);
const LOGIN_DEPENDENT_CHECKS = new Set([
  'P0.1',
  'P0.2',
  'P0.3',
  'P0.4',
  'P0.6',
  'P1.1',
  'P1.2',
  'P1.3',
  'G07',
  'G08',
  'G09',
  'G10',
]);

function runVercelCommand(args, options = {}) {
  return spawnSync('vercel', args, {
    encoding: 'utf8',
    env: process.env,
    killSignal: 'SIGKILL',
    ...options,
  });
}

function isLegacyVercelLogsArgsUnsupported(output) {
  return /unknown or unexpected option:\s*--environment/i.test(String(output || ''));
}

function parseVercelRuntimeJsonLines(raw) {
  const entries = [];
  for (const line of String(raw || '')
    .split('\n')
    .map(value => value.trim())
    .filter(Boolean)) {
    try {
      const payload = JSON.parse(line);
      entries.push(payload);
    } catch {
      // Ignore non-JSON banner/noise lines in mixed output streams.
    }
  }
  return entries;
}

function runtimeEntryMessage(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return String(entry.message || entry.text || entry.msg || '').trim();
}

function runtimeEntryLevel(entry) {
  if (!entry || typeof entry !== 'object') return '';
  return String(entry.level || entry.severity || '')
    .trim()
    .toLowerCase();
}

function isErrorRuntimeLevel(level) {
  return level === 'error' || level === 'fatal';
}

function isLoginDependentCheck(checkId) {
  return LOGIN_DEPENDENT_CHECKS.has(checkId);
}

function findMissingCommercialPromiseSections(requiredTestIds, observedByTestId) {
  return requiredTestIds.filter(testId => observedByTestId[testId] !== true);
}

function normalizeBoundaryText(value) {
  return String(value || '')
    .toLowerCase()
    .replaceAll(/\s+/g, ' ')
    .trim();
}

function compactBoundaryText(value) {
  return normalizeBoundaryText(value).replaceAll(/\s+/g, '');
}

function resolveAccountPasswordVar(accountKey) {
  const account = ACCOUNTS[accountKey];
  if (!account) {
    return null;
  }

  if (account.credentialSource) {
    return ACCOUNTS[account.credentialSource]?.passwordVar ?? null;
  }

  return account.passwordVar ?? null;
}

function findMissingBoundaryPhrases(requiredPhrases, observedText) {
  const normalizedObserved = normalizeBoundaryText(observedText);
  const compactObserved = compactBoundaryText(observedText);
  return requiredPhrases.filter(
    phrase =>
      !normalizedObserved.includes(normalizeBoundaryText(phrase)) &&
      !compactObserved.includes(compactBoundaryText(phrase))
  );
}

function findPresentBoundaryLeaks(forbiddenPhrases, observedText) {
  const normalizedObserved = normalizeBoundaryText(observedText);
  return forbiddenPhrases.filter(phrase =>
    normalizedObserved.includes(normalizeBoundaryText(phrase))
  );
}

function findMismatchedMatterAllowanceValues(expectedValues, observedValues) {
  return Object.entries(expectedValues).flatMap(([key, expected]) => {
    const actual = observedValues[key];
    return actual === expected ? [] : [`${key} expected=${expected} actual=${actual || 'missing'}`];
  });
}

function normalizeRoutePath(value) {
  const trimTrailingSlashes = pathname => {
    let end = pathname.length;
    while (end > 1 && pathname.charCodeAt(end - 1) === 47) {
      end -= 1;
    }
    return pathname.slice(0, end);
  };

  try {
    const parsed = new URL(value);
    return trimTrailingSlashes(parsed.pathname) || '/';
  } catch {
    return trimTrailingSlashes(String(value || '').trim()) || '/';
  }
}

function routePathsMatch(expectedUrl, actualUrl) {
  return normalizeRoutePath(expectedUrl) === normalizeRoutePath(actualUrl);
}

function parseBooleanEnv(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

function shouldDisallowSkippedChecks(envName) {
  const explicit = parseBooleanEnv(process.env.RELEASE_GATE_DISALLOW_SKIP);
  if (explicit != null) return explicit;
  return String(envName || '').toLowerCase() === 'production';
}

function shouldRunAuthEndpointPreflight(envName) {
  const explicit = parseBooleanEnv(process.env.RELEASE_GATE_AUTH_ENDPOINT_PREFLIGHT);
  if (explicit != null) return explicit;
  return String(envName || '').toLowerCase() !== 'production';
}

function checksAllowedToRemainSkipped() {
  const allowed = new Set();
  if (
    String(process.env.RELEASE_GATE_REQUIRE_ROLE_PANEL || '')
      .trim()
      .toLowerCase() === 'false'
  ) {
    allowed.add('P0.3');
    allowed.add('P0.4');
  }
  return allowed;
}

function skipAllowanceReasonForCheck(check) {
  if (
    check.id === 'P1.2' &&
    (check.signatures || []).includes('P1.2_SKIPPED_VALID_MEMBER_EMPTY_STATE')
  ) {
    return 'valid_member_empty_state';
  }
  if (
    (check.id === 'P0.3' || check.id === 'P0.4') &&
    (check.signatures || []).includes(`${check.id}_ROLE_PANEL_DISABLED`)
  ) {
    return 'RELEASE_GATE_REQUIRE_ROLE_PANEL=false';
  }
  return null;
}

async function executeCheck(checkId, runner) {
  console.log(`[release-gate] check_start=${checkId}`);
  const result = await runner();
  console.log(`[release-gate] check_done=${checkId} status=${result.status}`);
  return result;
}

function enforceNoSkipOnSelectedChecks(checks, selected, envName) {
  if (!shouldDisallowSkippedChecks(envName)) {
    return checks;
  }

  const selectedSet = new Set(selected);
  const skipAllowedChecks = checksAllowedToRemainSkipped();
  const byId = new Map(checks.map(check => [check.id, check]));

  for (const checkId of selected) {
    const check = byId.get(checkId);
    if (!check) {
      byId.set(
        checkId,
        checkResult(
          checkId,
          'FAIL',
          [`skip_policy=disallowed env=${envName}`, 'execution_result=missing'],
          [`${checkId}_NOT_EXECUTED`]
        )
      );
      continue;
    }

    if (check.status === 'SKIPPED') {
      const allowSkipped = skipAllowedChecks.has(checkId);
      const allowanceReason = skipAllowanceReasonForCheck(check);
      if (allowSkipped || allowanceReason) {
        byId.set(checkId, {
          ...check,
          evidence: [
            ...(check.evidence || []),
            `skip_policy=allowed reason=${allowanceReason || 'RELEASE_GATE_REQUIRE_ROLE_PANEL=false'}`,
          ],
        });
        continue;
      }
      const signatures = Array.from(
        new Set([...(check.signatures || []), `${checkId}_SKIPPED_NOT_ALLOWED`])
      );
      byId.set(checkId, {
        ...check,
        status: 'FAIL',
        evidence: [...(check.evidence || []), `skip_policy=disallowed env=${envName}`],
        signatures,
      });
    }
  }

  const normalized = [];
  for (const checkId of selected) {
    const check = byId.get(checkId);
    if (check) normalized.push(check);
  }
  for (const check of checks) {
    if (!selectedSet.has(check.id)) normalized.push(check);
  }
  return normalized;
}

function preflightEvidenceLine({ endpoint, attempt, status, message }) {
  if (typeof status === 'number') {
    return `auth_preflight endpoint=${endpoint} attempt=${attempt} status=${status}`;
  }
  return `auth_preflight endpoint=${endpoint} attempt=${attempt} transport_error=${compactErrorMessage(message)}`;
}

function evaluateCredentialPreflightResults(results) {
  const statuses = (results || [])
    .map(entry => entry?.status)
    .filter(status => typeof status === 'number');
  const hasSuccess = statuses.some(status => status >= 200 && status < 300);
  const allAuthDenied =
    statuses.length > 0 && statuses.every(status => status === 401 || status === 403);
  return { hasSuccess, allAuthDenied };
}

async function runAuthEndpointPreflight(runCtx) {
  const evidence = [];
  const signatures = [];
  const origin = new URL(runCtx.baseUrl).origin;
  const endpointPaths = [
    '/api/auth/get-session?disableCookieCache=true&disableRefresh=true',
    '/api/auth/sign-in/email',
  ];

  for (const endpointPath of endpointPaths) {
    const endpoint = `${origin}${endpointPath}`;
    let reached = false;

    for (let attempt = 1; attempt <= AUTH_PREFLIGHT_MAX_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(endpoint, {
          method: 'GET',
          headers: {
            Origin: origin,
            Referer: `${origin}/${runCtx.locale}/login`,
          },
          redirect: 'manual',
          signal: AbortSignal.timeout(AUTH_PREFLIGHT_TIMEOUT_MS),
        });

        evidence.push(preflightEvidenceLine({ endpoint, attempt, status: response.status }));
        if (AUTH_PREFLIGHT_ACCEPTED_STATUSES.has(response.status)) {
          reached = true;
          break;
        }

        signatures.push(
          `AUTH_PREFLIGHT_ENDPOINT_UNHEALTHY endpoint=${endpointPath} status=${response.status}`
        );
        return { status: 'FAIL', evidence, signatures };
      } catch (error) {
        const message = compactErrorMessage(error?.message || error);
        evidence.push(preflightEvidenceLine({ endpoint, attempt, message }));
        const infraMessage = classifyInfraNetworkFailure(message);

        if (infraMessage && attempt < AUTH_PREFLIGHT_MAX_ATTEMPTS) {
          const delay =
            AUTH_PREFLIGHT_BACKOFF_MS[Math.min(attempt - 1, AUTH_PREFLIGHT_BACKOFF_MS.length - 1)];
          await sleep(delay);
          continue;
        }

        if (infraMessage) {
          signatures.push(
            `AUTH_PREFLIGHT_INFRA_NETWORK endpoint=${endpointPath} message=${infraMessage}`
          );
        } else {
          signatures.push(`AUTH_PREFLIGHT_EXCEPTION endpoint=${endpointPath} message=${message}`);
        }
        return { status: 'FAIL', evidence, signatures };
      }
    }

    if (!reached) {
      signatures.push(`AUTH_PREFLIGHT_INFRA_NETWORK endpoint=${endpointPath} message=exhausted`);
      return { status: 'FAIL', evidence, signatures };
    }
  }

  return { status: 'PASS', evidence, signatures };
}

async function runAuthCredentialPreflight(runCtx) {
  const evidence = [];
  const signatures = [];
  const origin = new URL(runCtx.baseUrl).origin;
  const loginUrl = `${origin}/api/auth/sign-in/email`;
  const accountKeys = selectCredentialPreflightAccounts();
  const results = [];

  for (const accountKey of accountKeys) {
    const credentials = runCtx.credentials?.[accountKey];
    const email = credentials?.email || '';
    const password = credentials?.password || '';

    if (!email || !password) {
      evidence.push(
        `auth_credentials_preflight account=${accountKey} status=skipped_missing_creds`
      );
      continue;
    }

    const tenantId = ACCOUNTS[accountKey]?.tenantId;
    try {
      const sharedCooldownMs = getAuthLoginCooldownMs(runCtx.authState, Date.now());
      if (sharedCooldownMs > 0) {
        evidence.push(
          `auth_credentials_preflight account=${sessionCacheKeyForAccount(accountKey)} cooldown_ms=${sharedCooldownMs}`
        );
        await sleep(sharedCooldownMs);
      }
      const response = await fetch(loginUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Origin: origin,
          Referer: `${origin}/${runCtx.locale}/login`,
          ...(tenantId ? { 'x-tenant-id': tenantId } : {}),
        },
        body: JSON.stringify({
          email,
          password,
        }),
        redirect: 'manual',
        signal: AbortSignal.timeout(AUTH_PREFLIGHT_TIMEOUT_MS),
      });
      recordAuthLoginAttempt(runCtx.authState, Date.now());
      const status = response.status;
      results.push({ accountKey, status });
      evidence.push(
        `auth_credentials_preflight account=${sessionCacheKeyForAccount(accountKey)} status=${status}`
      );
      if (status === 429) {
        noteAuthRateLimit(
          runCtx.authState,
          parseRetryAfterSeconds(response.headers.get('retry-after')) ?? 60,
          Date.now()
        );
      }
    } catch (error) {
      const message = compactErrorMessage(error?.message || error, 320);
      evidence.push(
        `auth_credentials_preflight account=${sessionCacheKeyForAccount(accountKey)} transport_error=${message}`
      );
    }
  }

  const evaluation = evaluateCredentialPreflightResults(results);
  if (evaluation.allAuthDenied) {
    const summary = results.map(entry => `${entry.accountKey}:${entry.status}`).join(',');
    signatures.push(`AUTH_CREDENTIALS_MISCONFIG all_accounts_denied statuses=${summary}`);
    return {
      status: 'FAIL',
      evidence,
      signatures,
    };
  }

  return {
    status: 'PASS',
    evidence,
    signatures,
  };
}

function selectCredentialPreflightAccounts() {
  return [];
}

function parseArgs(argv) {
  const parsed = {
    baseUrl: DEFAULTS.baseUrl,
    envName: DEFAULTS.envName,
    locale: DEFAULTS.locale,
    suite: DEFAULTS.suite,
    outDir: DEFAULTS.outDir,
    pilotId: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--baseUrl' && next) {
      parsed.baseUrl = next;
      i += 1;
      continue;
    }
    if (token === '--envName' && next) {
      parsed.envName = next;
      i += 1;
      continue;
    }
    if (token === '--locale' && next) {
      parsed.locale = next;
      i += 1;
      continue;
    }
    if (token === '--suite' && next) {
      parsed.suite = next.toLowerCase();
      i += 1;
      continue;
    }
    if (token === '--outDir' && next) {
      parsed.outDir = next;
      i += 1;
      continue;
    }
    if (token === '--pilotId' && next) {
      parsed.pilotId = next;
      i += 1;
      continue;
    }
    if (token === '--help') {
      printHelp();
      process.exit(0);
    }
  }

  if (!SUITES[parsed.suite]) {
    console.error(
      `[release-gate] Unsupported suite "${parsed.suite}". Use one of: ${Object.keys(SUITES).join(', ')}`
    );
    process.exit(2);
  }

  return parsed;
}

function printHelp() {
  const lines = [
    'Release Gate runner',
    '',
    'Flags:',
    `  --baseUrl  (default: ${DEFAULTS.baseUrl})`,
    `  --envName  (default: ${DEFAULTS.envName})`,
    `  --locale   (default: ${DEFAULTS.locale})`,
    `  --suite    (default: ${DEFAULTS.suite}; options: ${Object.keys(SUITES).join('|')})`,
    `  --outDir   (default: ${DEFAULTS.outDir})`,
    '  --pilotId  (optional: create pilot-entry artifacts tied to this pilot id)',
  ];
  console.log(lines.join('\n'));
}

function runVercelLogsSweep(runCtx) {
  const evidence = [];
  const signatures = [];

  const versionCheck = runVercelCommand(['--version']);
  if (versionCheck.error) {
    evidence.push('vercel cli not available; skipped');
    return checkResult('P1.5.1', 'SKIPPED', evidence, signatures);
  }

  const commandArgs = [
    'logs',
    '--environment',
    runCtx.envName,
    '--since',
    '60m',
    '--no-branch',
    '--level',
    'error',
  ];

  const logs = runVercelCommand(commandArgs, { timeout: 120_000 });

  const combined = `${logs.stdout || ''}\n${logs.stderr || ''}`;
  const lines = combined
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const legacySupported = !isLegacyVercelLogsArgsUnsupported(combined);
  if (legacySupported) {
    if (logs.error) {
      evidence.push(`vercel logs failed to execute; skipped (${logs.error.message})`);
      return checkResult('P1.5.1', 'SKIPPED', evidence, signatures);
    }

    if (logs.status !== 0) {
      evidence.push(`vercel logs exited ${logs.status}; skipped`);
      evidence.push(...lines.slice(0, 4));
      return checkResult('P1.5.1', 'SKIPPED', evidence, signatures);
    }

    const meaningful = lines.filter(
      line => !EXPECTED_VERCEL_LOG_NOISE.some(pattern => pattern.test(line))
    );
    evidence.push('log_mode=legacy');
    evidence.push(`total error lines=${lines.length}`);
    evidence.push(`non-noise lines=${meaningful.length}`);
    evidence.push(...meaningful.slice(0, 6));

    const unexpectedFunctional = meaningful.filter(line =>
      FUNCTIONAL_LOG_ERROR_HINTS.some(pattern => pattern.test(line))
    );
    if (unexpectedFunctional.length > 0) {
      signatures.push(...unexpectedFunctional.map(line => `P1.5.1_UNEXPECTED_ERROR ${line}`));
      return checkResult('P1.5.1', 'FAIL', evidence, signatures);
    }

    return checkResult('P1.5.1', 'PASS', evidence, signatures);
  }

  const deploymentRef =
    runCtx.deployment?.deploymentUrl && runCtx.deployment.deploymentUrl !== 'unknown'
      ? runCtx.deployment.deploymentUrl
      : runCtx.baseUrl;

  const streamingLogs = runVercelCommand(['logs', deploymentRef, '--json'], {
    timeout: VERCEL_LOG_STREAM_TIMEOUT_MS,
  });

  const streamingCombined = `${streamingLogs.stdout || ''}\n${streamingLogs.stderr || ''}`;
  const streamingLines = streamingCombined
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);

  const timedOut = streamingLogs.error && streamingLogs.error.code === 'ETIMEDOUT';
  const unexpectedRuntimeError =
    streamingLogs.error &&
    streamingLogs.error.code !== 'ETIMEDOUT' &&
    streamingLogs.error.code !== 'ETERM';

  if (unexpectedRuntimeError) {
    evidence.push(`vercel logs stream failed; skipped (${streamingLogs.error.message})`);
    evidence.push(...streamingLines.slice(0, 4));
    return checkResult('P1.5.1', 'SKIPPED', evidence, signatures);
  }

  if (streamingLogs.status != null && streamingLogs.status !== 0 && !timedOut) {
    evidence.push(`vercel logs stream exited ${streamingLogs.status}; skipped`);
    evidence.push(...streamingLines.slice(0, 4));
    return checkResult('P1.5.1', 'SKIPPED', evidence, signatures);
  }

  const runtimeEntries = parseVercelRuntimeJsonLines(streamingLogs.stdout);
  const meaningfulRuntimeEntries = runtimeEntries.filter(entry => {
    const message = runtimeEntryMessage(entry);
    return message.length > 0 && !EXPECTED_VERCEL_LOG_NOISE.some(pattern => pattern.test(message));
  });
  const unexpectedFunctional = meaningfulRuntimeEntries.filter(entry => {
    const level = runtimeEntryLevel(entry);
    const message = runtimeEntryMessage(entry);
    return (
      isErrorRuntimeLevel(level) ||
      FUNCTIONAL_LOG_ERROR_HINTS.some(pattern => pattern.test(message))
    );
  });

  evidence.push('log_mode=streaming-json');
  evidence.push(`deployment_ref=${deploymentRef}`);
  evidence.push(`stream_window_ms=${VERCEL_LOG_STREAM_TIMEOUT_MS}`);
  evidence.push(`stream_timed_out=${timedOut}`);
  evidence.push(`runtime_entries=${runtimeEntries.length}`);
  evidence.push(`runtime_non_noise_entries=${meaningfulRuntimeEntries.length}`);
  evidence.push(
    ...meaningfulRuntimeEntries.slice(0, 6).map(entry => {
      const level = runtimeEntryLevel(entry) || 'unknown';
      const message = runtimeEntryMessage(entry);
      return `runtime_entry level=${level} message=${message}`;
    })
  );

  if (unexpectedFunctional.length > 0) {
    signatures.push(
      ...unexpectedFunctional.map(entry => {
        const level = runtimeEntryLevel(entry) || 'unknown';
        const message = runtimeEntryMessage(entry);
        return `P1.5.1_UNEXPECTED_ERROR level=${level} message=${message}`;
      })
    );
    return checkResult('P1.5.1', 'FAIL', evidence, signatures);
  }

  return checkResult('P1.5.1', 'PASS', evidence, signatures);
}

async function detectDeploymentMetadata(baseUrl, browser) {
  const tryInspect = () => {
    const inspectArgs = ['inspect', baseUrl];
    if (process.env.VERCEL_ORG) {
      inspectArgs.push('--scope', process.env.VERCEL_ORG);
    }

    const inspect = runVercelCommand(inspectArgs, { timeout: 60_000 });
    if (inspect.error || inspect.status !== 0) {
      return null;
    }

    const output = `${inspect.stdout || ''}\n${inspect.stderr || ''}`;
    const deploymentIdMatch = output.match(/\bdpl_[A-Za-z0-9]+\b/);
    const deploymentUrlMatch = output.match(/https:\/\/[A-Za-z0-9.-]+\.vercel\.app\b/i);

    if (!deploymentIdMatch && !deploymentUrlMatch) return null;
    return {
      deploymentId: deploymentIdMatch ? deploymentIdMatch[0] : 'unknown',
      deploymentUrl: deploymentUrlMatch ? deploymentUrlMatch[0] : 'unknown',
      source: 'vercel-inspect',
    };
  };

  const cliVersion = runVercelCommand(['--version'], { timeout: 10_000 });
  if (!cliVersion.error) {
    const inspected = tryInspect();
    if (inspected) return inspected;
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    const response = await page.goto(baseUrl, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.nav,
    });
    const headers = (response && response.headers()) || {};
    const vercelDeploymentUrl = headers['x-vercel-deployment-url'] || 'unknown';
    const vercelIdHeader = headers['x-vercel-id'] || '';
    let deploymentId = 'unknown';
    if (vercelIdHeader.includes('::')) {
      deploymentId = vercelIdHeader.split('::').pop().split('-').pop() || 'unknown';
    }
    if (deploymentId === 'unknown' && /dpl_/i.test(baseUrl)) {
      const match = baseUrl.match(/dpl_[A-Za-z0-9]+/);
      deploymentId = match ? match[0] : 'unknown';
    }
    return {
      deploymentId,
      deploymentUrl: vercelDeploymentUrl,
      source: 'http-headers',
    };
  } catch {
    return {
      deploymentId: 'unknown',
      deploymentUrl: 'unknown',
      source: 'unknown',
    };
  } finally {
    await context.close();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const configuredBaseUrl = normalizeBaseUrl(args.baseUrl);
  const requiredEnv = REQUIRED_ENV_BY_SUITE[args.suite] || REQUIRED_ENV_BY_SUITE.all;
  const missingEnv = getMissingEnv(requiredEnv);
  if (missingEnv.length > 0) {
    console.error('[release-gate] Missing required env vars:');
    for (const name of missingEnv) {
      console.error(`- ${name}`);
    }
    process.exit(2);
  }

  const credentials = {};
  for (const accountKey of Object.keys(ACCOUNTS)) {
    const account = ACCOUNTS[accountKey];
    const passwordVar = resolveAccountPasswordVar(accountKey);
    credentials[accountKey] = {
      email: process.env[account.emailVar] || '',
      password: passwordVar ? process.env[passwordVar] || '' : '',
    };
  }

  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch({ headless: true });
  const checks = [];

  try {
    const deployment = await detectDeploymentMetadata(configuredBaseUrl, browser);
    const resolvedBase = await resolveReachableBaseUrl(configuredBaseUrl, deployment, {
      allowDeploymentFallback:
        process.env.RELEASE_GATE_ALLOW_DEPLOYMENT_FALLBACK === '1' ||
        process.env.RELEASE_GATE_ALLOW_DEPLOYMENT_FALLBACK === 'true'
          ? true
          : args.envName !== 'production',
    });
    const baseUrl = resolvedBase.baseUrl;
    const runCtx = {
      baseUrl,
      locale: args.locale,
      suite: args.suite,
      envName: args.envName,
      credentials,
      deployment,
      authState: createAuthState(),
    };
    console.log(
      `[release-gate] base_url source=${resolvedBase.source} url=${baseUrl} probe_status=${String(
        resolvedBase.probeStatus ?? 'unknown'
      )}`
    );
    for (const failure of resolvedBase.failures) {
      console.warn(`[release-gate] base_url ${failure}`);
    }

    const selected = SUITES[args.suite];
    const loginDependentSelected = selected.filter(isLoginDependentCheck);
    let preflightBlocked = false;

    if (shouldRunAuthEndpointPreflight(runCtx.envName) && loginDependentSelected.length > 0) {
      const preflight = await runAuthEndpointPreflight(runCtx);
      if (preflight.status !== 'PASS') {
        preflightBlocked = true;
        const firstSignature =
          preflight.signatures[0] || 'AUTH_PREFLIGHT_INFRA_NETWORK message=unknown';
        for (const checkId of loginDependentSelected) {
          checks.push(
            checkResult(
              checkId,
              'FAIL',
              [...preflight.evidence],
              [`${checkId}_INFRA_NETWORK_PRECHECK_FAILED ${firstSignature}`]
            )
          );
        }
      }
    }

    if (
      !preflightBlocked &&
      runCtx.envName === 'production' &&
      loginDependentSelected.length > 0 &&
      selectCredentialPreflightAccounts().length > 0
    ) {
      const credentialPreflight = await runAuthCredentialPreflight(runCtx);
      if (credentialPreflight.status !== 'PASS') {
        preflightBlocked = true;
        const firstSignature =
          credentialPreflight.signatures[0] ||
          'AUTH_CREDENTIALS_MISCONFIG all_accounts_denied statuses=unknown';
        for (const checkId of loginDependentSelected) {
          checks.push(
            checkResult(
              checkId,
              'FAIL',
              [...credentialPreflight.evidence],
              [`${checkId}_MISCONFIG_CREDENTIALS_PRECHECK_FAILED ${firstSignature}`]
            )
          );
        }
      }
    } else if (
      !preflightBlocked &&
      runCtx.envName === 'production' &&
      loginDependentSelected.length > 0
    ) {
      checks.push(
        checkResult(
          'AUTH-PREFLIGHT',
          'INFO',
          ['auth_credentials_preflight disabled accounts=0'],
          []
        )
      );
    }

    if (!preflightBlocked) {
      if (selected.includes('P0.1')) {
        checks.push(
          await executeCheck('P0.1', () => runP01(browser, runCtx, { loginWithRunContext }))
        );
      }
      if (selected.includes('P0.2')) {
        checks.push(
          await executeCheck('P0.2', () => runP02(browser, runCtx, { loginWithRunContext }))
        );
      }
      if (selected.includes('P0.3') || selected.includes('P0.4')) {
        console.log('[release-gate] check_start=P0.3/P0.4');
        const roleChecks = await runP03AndP04(browser, runCtx, { loginWithRunContext });
        console.log(
          `[release-gate] check_done=P0.3 status=${roleChecks[0].status} check_done=P0.4 status=${roleChecks[1].status}`
        );
        if (selected.includes('P0.3')) checks.push(roleChecks[0]);
        if (selected.includes('P0.4')) checks.push(roleChecks[1]);
      }
      if (selected.includes('P0.6')) {
        checks.push(
          await executeCheck('P0.6', () => runP06(browser, runCtx, { loginWithRunContext }))
        );
      }
      if (selected.includes('P1.1') || selected.includes('P1.2')) {
        console.log('[release-gate] check_start=P1.1/P1.2');
        const memberChecks = await runP11AndP12(browser, runCtx, { checkResult });
        console.log(
          `[release-gate] check_done=P1.1 status=${memberChecks[0].status} check_done=P1.2 status=${memberChecks[1].status}`
        );
        if (selected.includes('P1.1')) checks.push(memberChecks[0]);
        if (selected.includes('P1.2')) checks.push(memberChecks[1]);
      }
      if (selected.includes('P1.3')) {
        checks.push(await executeCheck('P1.3', () => runP13(browser, runCtx, { checkResult })));
      }
      if (selected.includes('G07')) {
        checks.push(
          await executeCheck('G07', () =>
            runG07(browser, runCtx, {
              checkResult,
              compactErrorMessage,
              findMissingCommercialPromiseSections,
            })
          )
        );
      }
      if (selected.includes('G08')) {
        checks.push(
          await executeCheck('G08', () =>
            runG08(browser, runCtx, {
              checkResult,
              compactErrorMessage,
              findMissingBoundaryPhrases,
              findMissingCommercialPromiseSections,
              findPresentBoundaryLeaks,
              normalizeBoundaryText,
            })
          )
        );
      }
      if (selected.includes('G09')) {
        checks.push(
          await executeCheck('G09', () =>
            runG09(browser, runCtx, {
              checkResult,
              compactErrorMessage,
              findMissingBoundaryPhrases,
              findMissingCommercialPromiseSections,
              findMismatchedMatterAllowanceValues,
              normalizeBoundaryText,
            })
          )
        );
      }
      if (selected.includes('G10')) {
        checks.push(
          await executeCheck('G10', () =>
            runG10(browser, runCtx, {
              checkResult,
              compactErrorMessage,
              findMissingBoundaryPhrases,
              findMissingCommercialPromiseSections,
              normalizeBoundaryText,
              routePathsMatch,
            })
          )
        );
      }
      if (selected.includes('P1.5.1')) {
        checks.push(
          await executeCheck('P1.5.1', () => Promise.resolve(runVercelLogsSweep(runCtx)))
        );
      }
    } else if (selected.includes('P1.5.1')) {
      checks.push(await executeCheck('P1.5.1', () => Promise.resolve(runVercelLogsSweep(runCtx))));
    }

    const normalizedChecks = enforceNoSkipOnSelectedChecks(checks, selected, runCtx.envName);

    const generatedAt = new Date();
    const report = writeReleaseGateReport({
      outDir: args.outDir,
      envName: args.envName,
      baseUrl,
      suite: args.suite,
      deploymentId: runCtx.deployment.deploymentId,
      deploymentUrl: runCtx.deployment.deploymentUrl,
      deploymentSource: runCtx.deployment.source,
      generatedAt,
      executedChecks: selected,
      checks: normalizedChecks,
      accounts: {
        member: credentials.member.email,
        agent: credentials.agent.email,
        officeAgent: credentials.office_agent.email,
        staff: credentials.staff.email,
        adminKs: credentials.admin_ks.email,
        adminMk: credentials.admin_mk.email,
      },
      preconditions: {
        migrations: 'not evaluated by runner',
        env: `required release gate env vars present (${requiredEnv.length})`,
        flags: 'none',
      },
    });

    console.log(`[release-gate] report=${report.reportPath}`);
    if (args.pilotId) {
      const pilotArtifacts = createPilotEntryArtifacts({
        rootDir: process.cwd(),
        pilotId: args.pilotId,
        envName: args.envName,
        suite: args.suite,
        generatedAt,
        reportPath: report.reportPath,
        releaseVerdict: report.verdict,
      });
      console.log(`[release-gate] pilot_evidence_index=${pilotArtifacts.evidenceIndexPath}`);
      console.log(
        `[release-gate] pilot_evidence_pointer=${pilotArtifacts.pointerRow.evidence_index_path}`
      );
    }
    for (const check of normalizedChecks) {
      console.log(`[release-gate] ${check.id}=${check.status}`);
      for (const signature of check.signatures || []) {
        console.error(`[release-gate] signature ${signature}`);
      }
    }

    const hasFailure = normalizedChecks.some(check => check.status === 'FAIL');
    const hasMisconfig = normalizedChecks.some(check =>
      (check.signatures || []).some(signature => signature.includes('_MISCONFIG_'))
    );
    process.exit(hasMisconfig ? 2 : hasFailure ? 1 : 0);
  } finally {
    await browser.close();
  }
}

module.exports = {
  buildCommercialPromiseScenarios,
  buildEscalationAgreementCollectionFallbackScenarios,
  buildFreeStartGroupPrivacyScenarios,
  buildMatterAndSlaEnforcementScenarios,
  buildRouteAllowingLocalePath,
  classifyInfraNetworkFailure,
  computeRetryDelayMs,
  evaluateCredentialPreflightResults,
  enforceNoSkipOnSelectedChecks,
  collectVisibleTestIds,
  findMissingBoundaryPhrases,
  findMissingCommercialPromiseSections,
  findMismatchedMatterAllowanceValues,
  findPresentBoundaryLeaks,
  gotoWithSessionRetry,
  isLoginDependentCheck,
  isLegacyVercelLogsArgsUnsupported,
  parseVercelRuntimeJsonLines,
  parseRetryAfterSeconds,
  routePathsMatch,
  resolveAccountPasswordVar,
  resolveConfiguredRolePanelTarget,
  resolveConfiguredStaffClaimDetailUrl,
  resolveReachableBaseUrl,
  resolveTenantOverrideProbeUrl,
  selectCredentialPreflightAccounts,
  selectAlternativeActionableStatus,
  sessionCacheKeyForAccount,
  skipAllowanceReasonForCheck,
  shouldRunAuthEndpointPreflight,
  shouldDisallowSkippedChecks,
};

if (require.main === module) {
  main().catch(error => {
    console.error(`[release-gate] Fatal error: ${String(error.message || error)}`);
    process.exit(2);
  });
}
