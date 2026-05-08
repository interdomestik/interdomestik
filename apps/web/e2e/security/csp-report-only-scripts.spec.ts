import { type Browser, type Page, type TestInfo } from '@playwright/test';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

type CspViolation = {
  blockedURI: string;
  effectiveDirective: string;
  originalPolicy: string;
  sourceFile: string;
};

type ScriptFinding = {
  classification: 'first-party' | 'non-blocking' | 'third-party';
  index: number;
  nonce: string;
  reason: string;
  src: string;
  type: string;
};

type FlowConfig = {
  marker: string;
  markerTimeoutMs?: number;
  name: string;
  path: string;
};

const SCRIPT_DIRECTIVES = new Set(['script-src', 'script-src-elem', 'script-src-attr']);
const CSP_NONCE_PATTERN = /(?:^|\s)'nonce-([^']+)'(?:\s|$)/;
const CSP_NONCE_MODE = process.env.CSP_NONCE_MODE ?? 'off';
const captureInstalledPages = new WeakSet<Page>();

function scriptDirectiveNonce(csp: string): string | null {
  const directives = csp
    .split(';')
    .map(directive => directive.trim())
    .filter(Boolean);
  const scriptDirective = directives.find(directive => directive.startsWith('script-src '));
  const match = scriptDirective?.match(CSP_NONCE_PATTERN);
  return match?.[1] ?? null;
}

function isFirstPartyScriptViolation(violation: CspViolation, pageOrigin: string): boolean {
  if (!SCRIPT_DIRECTIVES.has(violation.effectiveDirective)) return false;
  if (violation.blockedURI === 'inline') return true;

  try {
    return new URL(violation.blockedURI).origin === pageOrigin;
  } catch {
    return false;
  }
}

async function installCspViolationCapture(page: Page): Promise<void> {
  if (captureInstalledPages.has(page)) return;
  captureInstalledPages.add(page);

  await page.addInitScript(() => {
    const win = globalThis as typeof globalThis & {
      __interdomestikCspViolations?: CspViolation[];
    };
    win.__interdomestikCspViolations = [];
    document.addEventListener('securitypolicyviolation', event => {
      win.__interdomestikCspViolations?.push({
        blockedURI: event.blockedURI,
        effectiveDirective: event.effectiveDirective,
        originalPolicy: event.originalPolicy,
        sourceFile: event.sourceFile,
      });
    });
  });
}

async function collectScriptFindings(page: Page): Promise<ScriptFinding[]> {
  return page.locator('script').evaluateAll(scripts => {
    const executableTypes = new Set(['', 'text/javascript', 'application/javascript', 'module']);
    const origin = globalThis.location.origin;

    return scripts.map((script, index) => {
      const element = script as HTMLScriptElement;
      const type = (element.getAttribute('type') ?? '').trim().toLowerCase();
      const src = element.src;
      const nonce = element.nonce || '';

      if (type && !executableTypes.has(type)) {
        return {
          classification: 'non-blocking',
          index,
          nonce,
          reason: `non-executable type=${type}`,
          src,
          type,
        };
      }

      if (src && new URL(src).origin !== origin) {
        return {
          classification: 'third-party',
          index,
          nonce,
          reason: 'external third-party origin',
          src,
          type,
        };
      }

      return {
        classification: 'first-party',
        index,
        nonce,
        reason: src ? 'same-origin script src' : 'inline script',
        src,
        type,
      };
    });
  });
}

async function assertReportModeCspClean(
  page: Page,
  responseHeaders: Record<string, string>,
  testInfo: TestInfo
) {
  const responseNonce = responseHeaders['x-nonce'];
  const reportOnlyCsp = responseHeaders['content-security-policy-report-only'];
  const pageOrigin = new URL(page.url()).origin;

  expect(responseNonce, 'response x-nonce').toMatch(/^[A-Za-z0-9_-]{22}$/);
  expect(reportOnlyCsp, 'Content-Security-Policy-Report-Only').toBeDefined();
  expect(scriptDirectiveNonce(reportOnlyCsp), 'script directive nonce').toBe(responseNonce);

  const probeNonce = await page.locator('[data-csp-nonce-probe]').evaluate(element => {
    return (element as HTMLScriptElement).nonce;
  });
  expect(probeNonce, 'data-csp-nonce-probe nonce').toBe(responseNonce);

  const findings = await collectScriptFindings(page);
  const firstPartyMissingNonce = findings.filter(
    finding => finding.classification === 'first-party' && finding.nonce !== responseNonce
  );

  const violations = await page.evaluate(() => {
    const win = globalThis as typeof globalThis & {
      __interdomestikCspViolations?: CspViolation[];
    };
    return win.__interdomestikCspViolations ?? [];
  });
  const firstPartyScriptViolations = violations.filter(violation =>
    isFirstPartyScriptViolation(violation, pageOrigin)
  );

  if (firstPartyMissingNonce.length > 0 || firstPartyScriptViolations.length > 0) {
    const evidence = {
      pageUrl: page.url(),
      responseNonce,
      reportOnlyScriptNonce: scriptDirectiveNonce(reportOnlyCsp),
      missingNonceCount: firstPartyMissingNonce.length,
      firstPartyScriptViolationCount: firstPartyScriptViolations.length,
      firstPartyMissingNonce,
      firstPartyScriptViolations,
    };

    await testInfo.attach('csp-report-only-findings.json', {
      body: JSON.stringify(evidence, null, 2),
      contentType: 'application/json',
    });

    const examples = firstPartyMissingNonce
      .slice(0, 8)
      .map(finding => `${finding.reason}: ${finding.src || '<inline>'}`)
      .join('\n');
    throw new Error(
      [
        'SEC03 report-mode CSP is not clean for first-party scripts.',
        `missingNonceCount=${firstPartyMissingNonce.length}`,
        `firstPartyScriptViolationCount=${firstPartyScriptViolations.length}`,
        examples ? `examples:\n${examples}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    );
  }
}

async function runFlow(page: Page, flow: FlowConfig, testInfo: TestInfo): Promise<void> {
  await installCspViolationCapture(page);
  const response = await gotoApp(page, flow.path, testInfo, {
    marker: flow.marker,
    markerTimeoutMs: flow.markerTimeoutMs,
  });
  expect(response?.ok(), `${flow.name} response must be successful`).toBeTruthy();
  await page.waitForLoadState('domcontentloaded');
  await assertReportModeCspClean(page, response?.headers() ?? {}, testInfo);
}

async function runAnonymousFlow(
  browser: Browser,
  flow: FlowConfig,
  testInfo: TestInfo
): Promise<void> {
  const context = await browser.newContext({
    baseURL: testInfo.project.use.baseURL,
    extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
    storageState: undefined,
  });

  try {
    const page = await context.newPage();
    await runFlow(page, flow, testInfo);
  } finally {
    await context.close();
  }
}

test.describe('CSP report-only first-party script coverage', () => {
  test.skip(
    CSP_NONCE_MODE !== 'report',
    'SEC03 report-only script coverage proof runs with CSP_NONCE_MODE=report'
  );

  test('public flows have nonce parity and zero first-party script-family reports', async ({
    browser,
  }, testInfo) => {
    for (const flow of [
      { name: 'landing', path: routes.home(testInfo), marker: 'landing-page-ready' },
      { name: 'pricing', path: routes.pricing(testInfo), marker: 'pricing-page-ready' },
      { name: 'login', path: routes.login(testInfo), marker: 'auth-ready' },
      { name: 'register', path: routes.register(testInfo), marker: 'pricing-page-ready' },
    ]) {
      await runAnonymousFlow(browser, flow, testInfo);
    }
  });

  test('member dashboard and claim wizard have nonce parity and zero reports', async ({
    authenticatedPage,
  }, testInfo) => {
    await runFlow(
      authenticatedPage,
      {
        name: 'member dashboard',
        path: routes.member(testInfo),
        marker: 'member-dashboard-ready',
        markerTimeoutMs: 30_000,
      },
      testInfo
    );

    await runFlow(
      authenticatedPage,
      {
        name: 'claim wizard step 1',
        path: routes.memberNewClaim(testInfo),
        marker: 'new-claim-page-ready',
        markerTimeoutMs: 30_000,
      },
      testInfo
    );
  });

  test('agent member surface has nonce parity and zero reports', async ({
    loginAs,
    page,
  }, testInfo) => {
    await loginAs('agent');
    await runFlow(
      page,
      {
        name: 'agent member surface',
        path: routes.agent(testInfo),
        marker: 'agent-members-ready',
        markerTimeoutMs: 30_000,
      },
      testInfo
    );
  });
});
