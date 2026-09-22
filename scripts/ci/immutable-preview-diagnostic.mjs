#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import {
  APPROVED_PREVIEW_ORIGIN,
  EXPECTED_COMMIT_SHA,
  assertApprovedPreviewOrigin,
  assertSameApprovedOrigin,
  assertTrustedPreflightReceipt,
  classifyDiagnosticError,
  createPolicyEnforcedLoginRequest,
  createReadOnlyRequestPolicy,
  responseRedirectChain,
  sanitizeDiagnosticUrl,
  sanitizePageTitle,
  sanitizeSessionSummary,
} from './immutable-preview-diagnostic-lib.mjs';
import { runPreflight } from './immutable-preview-preflight.mjs';

const require = createRequire(import.meta.url);
const { ACCOUNTS, MARKERS, SELECTORS, TIMEOUTS } = require('../release-gate/config.ts');
const { buildVercelProtectionHeaders } = require('../release-gate/vercel-protection.ts');
const { createAuthState, loginAs, resolvePlaywright } = require('../release-gate/shared.ts');

const TARGET_PATH = '/en/admin/users/golden_ks_a_member_1?tenantId=tenant_ks';
const OUTPUT_DIR = path.resolve('tmp/immutable-preview-diagnostic');
const OUTPUT_PATH = path.join(OUTPUT_DIR, 'receipt.json');
const PREFLIGHT_PATH = path.join(OUTPUT_DIR, 'provenance.json');

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`missing required diagnostic environment value: ${name}`);
  return value;
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
      loginRequest: createPolicyEnforcedLoginRequest(page.request, origin),
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).includes('--preflight')) {
    await runPreflight();
  } else {
    await main();
  }
}
