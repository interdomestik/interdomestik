import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  APPROVED_PREVIEW_ORIGIN,
  EXPECTED_COMMIT_SHA,
  assertApprovedPreviewOrigin,
  assertExpectedHealth,
  classifyDiagnosticError,
  resolveApprovedRedirect,
  sanitizeDiagnosticUrl,
} from './immutable-preview-diagnostic-lib.mjs';

const require = createRequire(import.meta.url);
const { TIMEOUTS } = require('../release-gate/config.ts');
const { buildVercelProtectionHeaders } = require('../release-gate/vercel-protection.ts');

const PREFLIGHT_PATH = path.resolve('tmp/immutable-preview-diagnostic/provenance.json');
const MAX_REDIRECTS = 3;

function requiredEnv(name, env) {
  const value = String(env[name] || '').trim();
  if (!value) throw new Error(`missing required diagnostic environment value: ${name}`);
  return value;
}

function requiredWorkflowCoordinate(name, env) {
  const value = requiredEnv(name, env);
  if (!/^\d+$/u.test(value)) throw new Error(`invalid diagnostic workflow coordinate: ${name}`);
  return value;
}

function classifyPreflightError(error) {
  const text = String(error?.message || error).toLowerCase();
  const causeCode = String(error?.cause?.code || '').toUpperCase();
  if (/redirect limit/u.test(text)) return 'redirect-limit';
  if (/redirect omitted location/u.test(text)) return 'redirect-missing-location';
  if (/redirect escaped/u.test(text)) return 'redirect-origin';
  if (/failed with status/u.test(text)) return 'http-status';
  if (error instanceof SyntaxError || /json/u.test(text)) return 'invalid-json';
  if (/health is not healthy/u.test(text)) return 'unhealthy';
  if (/commit sha mismatch/u.test(text)) return 'commit-mismatch';
  if (/not a preview deployment/u.test(text)) return 'deploy-env-mismatch';
  if (/missing required|not approved|invalid diagnostic workflow/u.test(text))
    return 'configuration';
  if (
    /abort|fetch failed/u.test(text) ||
    /^(?:EAI_AGAIN|ECONNREFUSED|ECONNRESET|ENETUNREACH|ENOTFOUND|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET)$/u.test(
      causeCode
    )
  ) {
    return 'network';
  }
  return classifyDiagnosticError(text);
}

async function fetchHealth(
  origin,
  headers,
  evidence,
  { fetchImpl = fetch, timeoutMs = TIMEOUTS.nav } = {}
) {
  let url = new URL('/api/health', origin);
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
    evidence.httpStatus = response.status;
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.ok) throw new Error(`health preflight failed with status ${response.status}`);
      return { payload: await response.json(), status: response.status };
    }
    const location = response.headers.get('location');
    if (!location) throw new Error('health preflight redirect omitted Location');
    const next = resolveApprovedRedirect(url.href, location, origin);
    evidence.redirects.push({ status: response.status, url: sanitizeDiagnosticUrl(next) });
    url = new URL(next);
  }
  throw new Error('health preflight exceeded the redirect limit');
}

async function writeReceipt(outputPath, receipt, failure) {
  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  } catch (writeError) {
    console.error('[immutable-preview-diagnostic] failed to persist sanitized preflight receipt');
    if (!failure) throw writeError;
  }
}

export async function runPreflight({
  env = process.env,
  fetchImpl = fetch,
  outputPath = PREFLIGHT_PATH,
  timeoutMs = TIMEOUTS.nav,
  buildProtectionHeaders = buildVercelProtectionHeaders,
} = {}) {
  const receipt = {
    schemaVersion: 1,
    diagnosticOnly: true,
    status: 'unverified',
    runId: null,
    runAttempt: null,
    origin: APPROVED_PREVIEW_ORIGIN,
    expectedCommitSha: EXPECTED_COMMIT_SHA,
    commitSha: null,
    deployEnv: null,
    httpStatus: null,
    redirects: [],
    error: null,
  };
  let failure = null;
  try {
    receipt.runId = requiredWorkflowCoordinate('GITHUB_RUN_ID', env);
    receipt.runAttempt = requiredWorkflowCoordinate('GITHUB_RUN_ATTEMPT', env);
    const origin = assertApprovedPreviewOrigin(requiredEnv('DIAGNOSTIC_PREVIEW_ORIGIN', env));
    const expectedSha = requiredEnv('DIAGNOSTIC_EXPECTED_SHA', env);
    if (expectedSha !== EXPECTED_COMMIT_SHA) {
      throw new Error('diagnostic expected commit SHA is not approved');
    }

    // Cookie mode redirects so a browser can retain Set-Cookie. This manual fetch has no cookie
    // jar and authenticates every hop with the bypass header instead.
    const bypassHeaders = { ...buildProtectionHeaders(origin) };
    delete bypassHeaders['x-vercel-set-bypass-cookie'];
    const health = await fetchHealth(origin, bypassHeaders, receipt, { fetchImpl, timeoutMs });
    const provenance = assertExpectedHealth(health.payload, expectedSha);
    Object.assign(receipt, {
      status: 'verified',
      commitSha: provenance.commitSha,
      deployEnv: provenance.deployEnv,
      httpStatus: health.status,
    });
  } catch (error) {
    failure = error;
    receipt.error = { category: classifyPreflightError(error) };
  }

  await writeReceipt(outputPath, receipt, failure);
  console.log(`[immutable-preview-diagnostic] preflight=${receipt.status} receipt=${outputPath}`);
  if (failure) throw failure;
  return receipt;
}
