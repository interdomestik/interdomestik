#!/usr/bin/env node

const { spawnSync } = require('node:child_process');

const { DEFAULTS, SUITES, ACCOUNTS, REQUIRED_ENV_BY_SUITE, TIMEOUTS } = require('./config.ts');
const { writeReleaseGateReport } = require('./report.ts');
const { resolvePlaywright } = require('./lib/gate-utils.ts');
const { runP01, runP02, runP03AndP04, runP06 } = require('./checks/p0.ts');
const { runP11AndP12, runP13, runVercelLogsSweep } = require('./checks/p1.ts');
const { runP2 } = require('./checks/p2.ts');

function parseArgs(argv) {
  const parsed = {
    baseUrl: DEFAULTS.baseUrl,
    envName: DEFAULTS.envName,
    locale: DEFAULTS.locale,
    suite: DEFAULTS.suite,
    outDir: DEFAULTS.outDir,
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
  ];
  console.log(lines.join('\n'));
}

function normalizeBaseUrl(baseUrl) {
  return baseUrl.replace(/\/+$/, '');
}

function getMissingEnv(requiredVars) {
  return requiredVars.filter(
    varName => !process.env[varName] || String(process.env[varName]).trim() === ''
  );
}

async function detectDeploymentMetadata(baseUrl, browser) {
  const tryInspect = () => {
    const inspectArgs = ['inspect', baseUrl];
    if (process.env.VERCEL_ORG) {
      inspectArgs.push('--scope', process.env.VERCEL_ORG);
    }

    const inspect = spawnSync('vercel', inspectArgs, {
      encoding: 'utf8',
      env: process.env,
      timeout: 60_000,
    });
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

  const cliVersion = spawnSync('vercel', ['--version'], { encoding: 'utf8', timeout: 10_000 });
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
  const baseUrl = normalizeBaseUrl(args.baseUrl);
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
    credentials[accountKey] = {
      email: process.env[account.emailVar] || '',
      password: process.env[account.passwordVar] || '',
    };
  }

  const { chromium } = resolvePlaywright();
  const browser = await chromium.launch({ headless: true });
  const checks = [];

  try {
    const deployment = await detectDeploymentMetadata(baseUrl, browser);
    const runCtx = {
      baseUrl,
      locale: args.locale,
      suite: args.suite,
      envName: args.envName,
      credentials,
      deployment,
    };

    const selected = SUITES[args.suite];

    if (selected.includes('P0.1')) checks.push(await runP01(browser, runCtx));
    if (selected.includes('P0.2')) checks.push(await runP02(browser, runCtx));
    if (selected.includes('P0.3') || selected.includes('P0.4')) {
      const roleChecks = await runP03AndP04(browser, runCtx);
      if (selected.includes('P0.3')) checks.push(roleChecks[0]);
      if (selected.includes('P0.4')) checks.push(roleChecks[1]);
    }
    if (selected.includes('P0.6')) checks.push(await runP06(browser, runCtx));

    if (selected.includes('P1.1') || selected.includes('P1.2')) {
      const memberChecks = await runP11AndP12(browser, runCtx);
      if (selected.includes('P1.1')) checks.push(memberChecks[0]);
      if (selected.includes('P1.2')) checks.push(memberChecks[1]);
    }
    if (selected.includes('P1.3')) checks.push(await runP13(browser, runCtx));
    if (selected.includes('P1.5.1')) checks.push(runVercelLogsSweep(runCtx));

    if (
      selected.includes('P2.1') ||
      selected.includes('P2.2') ||
      selected.includes('P2.3') ||
      selected.includes('P2.4') ||
      selected.includes('P2.5')
    ) {
      const p2Checks = await runP2(browser, runCtx);
      for (const check of p2Checks) {
        if (selected.includes(check.id)) checks.push(check);
      }
    }

    const report = writeReleaseGateReport({
      outDir: args.outDir,
      envName: args.envName,
      baseUrl,
      suite: args.suite,
      deploymentId: runCtx.deployment.deploymentId,
      deploymentUrl: runCtx.deployment.deploymentUrl,
      deploymentSource: runCtx.deployment.source,
      generatedAt: new Date(),
      executedChecks: selected,
      checks,
      accounts: {
        member: credentials.member.email,
        agent: credentials.agent.email,
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
    for (const check of checks) {
      console.log(`[release-gate] ${check.id}=${check.status}`);
      for (const signature of check.signatures || []) {
        console.error(`[release-gate] signature ${signature}`);
      }
    }

    const hasFailure = checks.some(check => check.status === 'FAIL');
    const hasMisconfig = checks.some(check =>
      (check.signatures || []).some(signature => signature.includes('_MISCONFIG_'))
    );
    process.exit(hasMisconfig ? 2 : hasFailure ? 1 : 0);
  } finally {
    await browser.close();
  }
}

main().catch(error => {
  console.error(`[release-gate] Fatal error: ${String(error.message || error)}`);
  process.exit(2);
});
