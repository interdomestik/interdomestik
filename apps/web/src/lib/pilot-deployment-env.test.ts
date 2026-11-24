// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import webPackage from '../../package.json';
import { assertPilotDeploymentEnv } from './pilot-deployment-env';

const VALUE = 'private-fixture-value';
const EMPTY_MANIFEST = '[]';
const production = { NODE_ENV: 'production' } as const;
const refusable = [
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'E2E_API_SECRET',
  'E2E_SMTP_HOST',
  'E2E_SMTP_PORT',
  'PLAYWRIGHT',
  'INTERDOMESTIK_AUTOMATED',
  'NEXT_PUBLIC_INTERDOMESTIK_AUTOMATED',
  'INTERDOMESTIK_LOCAL_E2E',
  'INTERDOMESTIK_E2E_DIAGNOSTICS',
  'INTERDOMESTIK_E2E_FAKE_STORAGE_SIGNING',
  'BILLING_TEST_MODE',
  'NEXT_PUBLIC_BILLING_TEST_MODE',
  'PADDLE_API_KEY',
  'PADDLE_FUTURE_SETTING',
  'NEXT_PUBLIC_PADDLE_CLIENT_TOKEN',
];

describe('assertPilotDeploymentEnv', () => {
  it.each(refusable)('refuses %s by name without printing its value', name => {
    const check = () => assertPilotDeploymentEnv({ ...production, [name]: VALUE }, EMPTY_MANIFEST);
    expect(check).toThrow(name);
    expect(check).not.toThrow(VALUE);
  });

  it('refuses the exact identity sign-up opening value', () => {
    const check = () =>
      assertPilotDeploymentEnv({ ...production, IDENTITY_PUBLIC_SIGN_UP: 'open' }, EMPTY_MANIFEST);
    expect(check).toThrow('IDENTITY_PUBLIC_SIGN_UP');
    expect(check).not.toThrow(/\bopen\b/u);
  });

  it('accepts empty settings and closed identity sign-up in a production release', () => {
    expect(() =>
      assertPilotDeploymentEnv(
        {
          ...Object.fromEntries(refusable.map(key => [key, ''])),
          ...production,
          IDENTITY_PUBLIC_SIGN_UP: 'closed',
          CI: 'true',
        },
        EMPTY_MANIFEST
      )
    ).not.toThrow();
  });

  it.each([
    undefined,
    '',
    VALUE,
    '{}',
    'null',
    '""',
    '[0]',
    '["NEXT_PUBLIC_APP_URL"]',
    '["PADDLE_API_KEY"]',
  ])('requires a valid manifest of known public names in production (%s)', manifest => {
    const check = () => assertPilotDeploymentEnv(production, manifest);
    expect(check).toThrow('INTERDOMESTIK_BUILT_PILOT_ENV');
    expect(check).not.toThrow(VALUE);
  });

  it.each([
    {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://fixture@ci-postgres/test',
      DATABASE_URL_RLS: 'postgres://runtime@ci-postgres/test',
      SEED_TARGET_CONFIRM: 'plan070:ci-postgres',
      PLAYWRIGHT: '1',
      INTERDOMESTIK_LOCAL_E2E: '1',
    },
    { VERCEL: '1', VERCEL_ENV: 'preview' },
  ])('permits the same settings in a recognized non-production release', releaseEnv => {
    expect(() =>
      assertPilotDeploymentEnv(
        {
          ...Object.fromEntries(refusable.map(key => [key, VALUE])),
          ...releaseEnv,
          IDENTITY_PUBLIC_SIGN_UP: 'open',
        },
        undefined
      )
    ).not.toThrow();
  });
});

describe('pilot build preflight', () => {
  const script = fileURLToPath(new URL('../../scripts/check-pilot-build-env.mjs', import.meta.url));
  const baseEnv: NodeJS.ProcessEnv = { PATH: process.env.PATH, ...production };

  it.each(['build', 'build:ci'] as const)('checks %s before invoking Next', script => {
    expect(webPackage.scripts[script]).toMatch(
      /^INTERDOMESTIK_BUILT_PILOT_ENV="\$\(node scripts\/check-pilot-build-env\.mjs\)" && export INTERDOMESTIK_BUILT_PILOT_ENV && next build\b/u
    );
  });

  it('emits only sorted refused public names for a signal-free CI build and refuses that artifact in production', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'pilot-build-env-'));
    try {
      const build = spawnSync(process.execPath, [script], {
        cwd,
        env: {
          ...baseEnv,
          CI: 'true',
          PLAYWRIGHT: '1',
          INTERDOMESTIK_LOCAL_E2E: '1',
          IDENTITY_PUBLIC_SIGN_UP: 'open',
          PADDLE_API_KEY: VALUE,
          NEXT_PUBLIC_PADDLE_FUTURE_SETTING: VALUE,
          NEXT_PUBLIC_INTERDOMESTIK_AUTOMATED: '1',
          NEXT_PUBLIC_BILLING_TEST_MODE: '1',
          NEXT_PUBLIC_PADDLE_EMPTY: '',
          NEXT_PUBLIC_APP_URL: 'https://example.test',
        },
        encoding: 'utf8',
      });
      expect(build.status).toBe(0);
      const refusedPublicNames = [
        'NEXT_PUBLIC_BILLING_TEST_MODE',
        'NEXT_PUBLIC_INTERDOMESTIK_AUTOMATED',
        'NEXT_PUBLIC_PADDLE_FUTURE_SETTING',
      ];
      expect(build.stdout).toBe(JSON.stringify(refusedPublicNames));
      expect(() => assertPilotDeploymentEnv(production, build.stdout)).toThrow(
        `Production release refuses ${refusedPublicNames.join(', ')}`
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it('checks values loaded from the production dotenv files with Next precedence', () => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'pilot-build-env-'));
    const setting = 'NEXT_PUBLIC_BILLING_TEST_MODE';
    const env = { ...baseEnv, INTERDOMESTIK_PRODUCTION: '1' };
    try {
      writeFileSync(path.join(cwd, '.env'), `${setting}=\n`);
      writeFileSync(path.join(cwd, '.env.production.local'), `${setting}=${VALUE}\n`);
      const refused = spawnSync(process.execPath, [script], {
        cwd,
        env,
        encoding: 'utf8',
      });
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain(setting);
      expect(refused.stderr).not.toContain(VALUE);
      expect(refused.stdout).toBe(JSON.stringify([setting]));

      const allowed = spawnSync(process.execPath, [script], {
        cwd,
        env: { ...env, [setting]: '' },
        encoding: 'utf8',
      });
      expect(allowed.status).toBe(0);
      expect(allowed.stdout).toBe(EMPTY_MANIFEST);
      expect(() => assertPilotDeploymentEnv(production, allowed.stdout)).not.toThrow();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
