import { readDisposableTargetClass } from '@interdomestik/database/constants';
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';
import { resolveE2eRuntimeUrl } from '../../../../scripts/e2e-runtime-role.mjs';
import { freePort } from './test/isolated-port';

async function respondsToReadiness(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/robots.txt`, {
      signal: AbortSignal.timeout(500),
    });
    await response.body?.cancel();
    return response.ok;
  } catch {
    return false;
  }
}

async function startBuiltServer(env: NodeJS.ProcessEnv, refusedName?: string) {
  const standalone = path.resolve(__dirname, '../../.next/standalone');
  const servers = [path.join(standalone, 'apps/web/server.js'), path.join(standalone, 'server.js')];
  const server = servers.find(existsSync);
  if (!server) throw new Error('Missing the built CI standalone server');

  const port = await freePort();
  const child = spawn(process.execPath, [server], {
    env: { ...env, PORT: String(port), HOSTNAME: '127.0.0.1' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  const closed = new Promise<number | null>(resolve => {
    child.once('error', () => resolve(null));
    child.once('close', code => resolve(code));
  });
  let refused = false;
  let tail = '';
  child.stderr.on('data', (chunk: Buffer) => {
    tail = (tail + chunk.toString()).slice(-1024);
    if (refusedName && tail.includes('Production release refuses') && tail.includes(refusedName)) {
      refused = true;
    }
  });

  try {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) {
        const exitCode = await closed;
        return { ready: false, exitCode, refused };
      }
      if (await respondsToReadiness(port)) return { ready: true, exitCode: null, refused };
      await pause(100);
    }
    throw new Error('Built CI server startup probe timed out');
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    await closed;
  }
}

test('the built CI server starts on disposable targets and exits before readiness on refusal', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'gate-ks-sq', 'Startup is independent of tenant and locale.');
  test.skip(!testInfo.config.webServer, 'The startup contract uses the CI web server environment.');
  test.setTimeout(75_000);

  const adminUrl = process.env.DATABASE_URL;
  if (!adminUrl) throw new Error('Expected the CI lane admin database URL');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...testInfo.config.webServer?.env,
    NODE_ENV: 'production',
    DATABASE_URL_RLS: resolveE2eRuntimeUrl(
      adminUrl,
      process.env.E2E_SERVER_DATABASE_URL_RLS || undefined
    ),
    REQUIRE_RLS_INTEGRATION: '1',
  };
  if (!readDisposableTargetClass(env)) throw new Error('Expected the CI lane database URLs');

  expect(await startBuiltServer(env)).toMatchObject({ ready: true });
  expect(
    await startBuiltServer(
      { ...env, INTERDOMESTIK_DEPLOY_ENV: 'production', IDENTITY_PUBLIC_SIGN_UP: 'open' },
      'IDENTITY_PUBLIC_SIGN_UP'
    )
  ).toEqual({ ready: false, exitCode: 1, refused: true });
  expect(
    await startBuiltServer(
      { ...env, DATABASE_URL_RLS: 'postgres://fixture@outside.invalid/test' },
      'INTERDOMESTIK_LOCAL_E2E'
    )
  ).toEqual({ ready: false, exitCode: 1, refused: true });
});

test('the built CI server refuses a baked public test value in production', async ({}, testInfo) => {
  test.skip(testInfo.project.name !== 'gate-ks-sq', 'Startup is independent of tenant and locale.');
  test.skip(!testInfo.config.webServer, 'The startup contract uses the CI standalone artifact.');

  expect(
    await startBuiltServer(
      {
        PATH: process.env.PATH,
        NODE_ENV: 'production',
        INTERDOMESTIK_DEPLOY_ENV: 'production',
        NEXT_PUBLIC_BILLING_TEST_MODE: '',
        INTERDOMESTIK_BUILT_PILOT_ENV: '[]',
      },
      'NEXT_PUBLIC_BILLING_TEST_MODE'
    )
  ).toEqual({ ready: false, exitCode: 1, refused: true });
});
