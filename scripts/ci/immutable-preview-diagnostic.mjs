#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

import {
  APPROVED_PREVIEW_ORIGIN,
  EXPECTED_COMMIT_SHA,
  assertApprovedPreviewOrigin,
  assertExpectedHealth,
  assertSameApprovedOrigin,
  assertTrustedPreflightReceipt,
  classifyDiagnosticError,
  createReadOnlyRequestPolicy,
  responseRedirectChain,
  resolveApprovedRedirect,
  sanitizeDiagnosticUrl,
  sanitizePageTitle,
  sanitizeSessionSummary,
} from './immutable-preview-diagnostic-lib.mjs';

const require = createRequire(import.meta.url);
const { ACCOUNTS, MARKERS, SELECTORS, TIMEOUTS } = require('../release-gate/config.ts');
const { buildVercelProtectionHeaders } = require('../release-gate/vercel-protection.ts');
const { createAuthState, loginAs, resolvePlaywright } = require('../release-gate/shared.ts');

const TARGET_PATH = '/en/admin/users/golden_ks_a_member_1?tenantId=tenant_ks';
const OUTPUT_DIR = path.resolve('tmp/immutable-preview-diagnostic');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'receipt.json');
const PREFLIGHT_PATH = path.join(OUTPUT_DIR, 'provenance.json');
const MAX_REDIRECTS = 3;

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`missing required diagnostic environment value: ${name}`);
  return value;
}

async function fetchHealth(origin, headers) {
  let url = new URL('/api/health', origin);
  const redirects = [];
  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt += 1) {
    const response = await fetch(url, {
      method: 'GET',
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUTS.nav),
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.ok) throw new Error(`health preflight failed with status ${response.status}`);
      return { payload: await response.json(), redirects, status: response.status };
    }
    const location = response.headers.get('location');
    if (!location) throw new Error('health preflight redirect omitted Location');
    const next = resolveApprovedRedirect(url.href, location, origin);
    redirects.push({ status: response.status, url: sanitizeDiagnosticUrl(next) });
    url = new URL(next);
  }
  throw new Error('health preflight exceeded the redirect limit');
}

async function markerSnapshot(page) {
  const inspect = async selector => {
    const locator = page.locator(selector);
    const count = await locator.count().catch(() => 0);
    const visible =
      count > 0
        ? await locator
            .first()
            .isVisible()
            .catch(() => false)
        : false;
    return { count, visible };
  };
  return {
    roleSelectTrigger: await inspect(SELECTORS.roleSelectTrigger),
    userRolesTable: await inspect(SELECTORS.userRolesTable),
    adminReady: await inspect(`[data-testid="${MARKERS.admin}"]`),
    notFound: await inspect(`[data-testid="${MARKERS.notFound}"]`),
    nextErrorBoundary: await inspect('body[data-nextjs-error], nextjs-portal'),
  };
}

async function runBrowserDiagnostic(origin, credentials, bypassHeaders) {
  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch({ headless: true });
  const blockedRequests = [];
  const browserErrors = [];
  const failedRequests = [];
  const errorResponses = [];
  try {
    const context = await browser.newContext({ extraHTTPHeaders: bypassHeaders });
    const classify = createReadOnlyRequestPolicy(origin);
    await context.routeWebSocket('**/*', websocket =>
      websocket.close({ code: 1008, reason: 'read-only diagnostic' })
    );
    await context.route('**/*', async route => {
      const request = route.request();
      const classification = classify({ method: request.method(), url: request.url() });
      if (classification === 'block-origin' || classification === 'block-unsafe') {
        blockedRequests.push({
          classification,
          method: request.method(),
          url: sanitizeDiagnosticUrl(request.url()),
        });
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });

    const page = await context.newPage();
    page.on('console', message => {
      if (message.type() === 'error') {
        browserErrors.push({
          source: 'console',
          category: classifyDiagnosticError(message.text()),
          url: sanitizeDiagnosticUrl(message.location().url || origin),
        });
      }
    });
    page.on('pageerror', error =>
      browserErrors.push({ source: 'page', category: classifyDiagnosticError(error.message) })
    );
    page.on('requestfailed', request => {
      failedRequests.push({
        method: request.method(),
        url: sanitizeDiagnosticUrl(request.url()),
        reasonCategory: classifyDiagnosticError(request.failure()?.errorText || 'unknown'),
      });
    });
    page.on('response', response => {
      if (response.status() >= 400) {
        errorResponses.push({
          status: response.status(),
          url: sanitizeDiagnosticUrl(response.url()),
        });
      }
    });

    await loginAs(page, {
      account: 'admin_ks',
      credentials,
      baseUrl: origin,
      authOrigin: origin,
      locale: 'en',
      authState: createAuthState(),
      forceFresh: true,
    });
    assertSameApprovedOrigin(page.url(), origin, 'login bootstrap');

    const sessionUrl = new URL('/api/auth/get-session', origin).href;
    const sessionResponse = await page.request.get(sessionUrl, {
      headers: { Origin: origin, Referer: `${origin}/en/login`, ...bypassHeaders },
      maxRedirects: 0,
    });
    assertSameApprovedOrigin(sessionResponse.url(), origin, 'session read');
    if (!sessionResponse.ok()) {
      throw new Error(`session read failed with status ${sessionResponse.status()}`);
    }
    const session = sanitizeSessionSummary(await sessionResponse.json(), credentials.email);

    const targetUrl = new URL(TARGET_PATH, origin).href;
    const response = await page.goto(targetUrl, {
      waitUntil: 'domcontentloaded',
      timeout: TIMEOUTS.nav,
    });
    assertSameApprovedOrigin(page.url(), origin, 'target navigation');
    const atDomContentLoaded = await markerSnapshot(page);
    const responseBody = response ? await response.text().catch(() => '') : '';
    const originalDocument = {
      roleSelectTriggerMarkup: responseBody.includes('data-testid="role-select-trigger"'),
      userRolesTableMarkup: responseBody.includes('data-testid="user-roles-table"'),
      notFoundMarkup: responseBody.includes(`data-testid="${MARKERS.notFound}"`),
    };

    const ready = page
      .locator(`${SELECTORS.roleSelectTrigger}, ${SELECTORS.userRolesTable}`)
      .first()
      .waitFor({ state: 'visible', timeout: TIMEOUTS.nav })
      .then(() => true)
      .catch(() => false);
    const panelVisible = await ready;
    const atDeadline = await markerSnapshot(page);

    return {
      outcome: panelVisible ? 'panel-visible' : 'panel-not-visible',
      navigation: {
        status: response?.status() ?? null,
        finalUrl: sanitizeDiagnosticUrl(page.url()),
        title: sanitizePageTitle(await page.title()),
        redirects: await responseRedirectChain(response),
      },
      session,
      markers: { atDomContentLoaded, atDeadline },
      originalDocument,
      blockedRequests: blockedRequests.slice(0, 20),
      browserErrors: Array.from(
        new Map(browserErrors.map(item => [JSON.stringify(item), item])).values()
      ).slice(0, 20),
      failedRequests: failedRequests.slice(0, 20),
      errorResponses: errorResponses.slice(0, 20),
    };
  } finally {
    await browser.close();
  }
}

async function writeJson(file, value) {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function runPreflight() {
  const origin = assertApprovedPreviewOrigin(requiredEnv('DIAGNOSTIC_PREVIEW_ORIGIN'));
  const expectedSha = requiredEnv('DIAGNOSTIC_EXPECTED_SHA');
  if (expectedSha !== EXPECTED_COMMIT_SHA) {
    throw new Error('diagnostic expected commit SHA is not approved');
  }
  const bypassHeaders = buildVercelProtectionHeaders(origin);
  const health = await fetchHealth(origin, bypassHeaders);
  const provenance = assertExpectedHealth(health.payload, expectedSha);
  const receipt = {
    status: 'verified',
    runId: requiredEnv('GITHUB_RUN_ID'),
    runAttempt: requiredEnv('GITHUB_RUN_ATTEMPT'),
    origin,
    commitSha: provenance.commitSha,
    deployEnv: provenance.deployEnv,
    httpStatus: health.status,
    redirects: health.redirects,
  };
  await writeJson(PREFLIGHT_PATH, receipt);
  console.log(`[immutable-preview-diagnostic] preflight=verified receipt=${PREFLIGHT_PATH}`);
}

async function main() {
  const startedAt = new Date().toISOString();
  const report = {
    schemaVersion: 1,
    diagnosticOnly: true,
    startedAt,
    target: { origin: APPROVED_PREVIEW_ORIGIN, expectedCommitSha: EXPECTED_COMMIT_SHA },
    provenance: null,
    browser: null,
    status: 'failed',
    error: null,
  };
  let exitCode = 1;
  try {
    const origin = assertApprovedPreviewOrigin(requiredEnv('DIAGNOSTIC_PREVIEW_ORIGIN'));
    const expectedSha = requiredEnv('DIAGNOSTIC_EXPECTED_SHA');
    const bypassHeaders = buildVercelProtectionHeaders(origin);
    const preflight = JSON.parse(await fs.readFile(PREFLIGHT_PATH, 'utf8'));
    report.provenance = assertTrustedPreflightReceipt(
      preflight,
      requiredEnv('GITHUB_RUN_ID'),
      requiredEnv('GITHUB_RUN_ATTEMPT')
    );
    if (expectedSha !== report.provenance.commitSha) {
      throw new Error('diagnostic expected commit SHA differs from trusted preflight');
    }

    // This credential-bearing phase starts only after the separate provenance step succeeds.
    const credentials = {
      email: requiredEnv(ACCOUNTS.admin_ks.emailVar),
      password: requiredEnv(ACCOUNTS.admin_ks.passwordVar),
    };
    report.browser = await runBrowserDiagnostic(origin, credentials, bypassHeaders);
    report.status = 'diagnostic-complete';
    exitCode = 0;
  } catch (error) {
    report.error = { category: classifyDiagnosticError(error?.message || error) };
  } finally {
    report.completedAt = new Date().toISOString();
    await writeJson(OUTPUT_PATH, report);
    console.log(
      `[immutable-preview-diagnostic] status=${report.status} outcome=${report.browser?.outcome || 'none'} receipt=${OUTPUT_PATH}`
    );
  }
  process.exitCode = exitCode;
}

if (process.argv.slice(2).includes('--preflight')) {
  await runPreflight();
} else {
  await main();
}
