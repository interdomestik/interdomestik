import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveDeploymentOrigin } from './deployment-origin.mjs';

const LOCAL = 'http://127.0.0.1:3000';
const STAGING = 'https://staging.interdomestik.com';
const PRODUCTION = 'https://ida.interdomestik.com';
const local = { NEXT_PUBLIC_APP_URL: LOCAL, BETTER_AUTH_URL: LOCAL, NODE_ENV: 'production' };
const source = (file: string): string =>
  readFileSync(new URL(`../../../${file}`, import.meta.url), 'utf8');
function workflowUrls(file: string): Record<string, string> {
  const text = source(`.github/workflows/${file}`);
  return Object.fromEntries(
    ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL'].map(key => {
      const value = new RegExp(`^\\s+${key}: (https?://\\S+)$`, 'm').exec(text)?.[1];
      if (!value) throw new Error(`Missing literal ${key} in ${file}`);
      return [key, value];
    })
  );
}
const preview = {
  VERCEL_ENV: 'preview',
  NEXT_PUBLIC_APP_URL: STAGING,
  BETTER_AUTH_URL: STAGING,
  IDA_HOST: 'staging.interdomestik.com',
};

describe('existing deployment lanes without new configuration', () => {
  it('Docker gate accepts the exact docker-compose runtime URLs and independent routing host', () => {
    const compose = source('docker-compose.yml');
    const env = Object.fromEntries(
      ['NEXT_PUBLIC_APP_URL', 'NEXT_PUBLIC_SITE_URL', 'BETTER_AUTH_URL', 'IDA_HOST'].map(key => {
        const raw = new RegExp(`- ${key}=(\\S+)`).exec(compose)?.[1];
        if (!raw) throw new Error(`Missing Docker runtime ${key}`);
        return [key, raw.replace('${DOCKER_WEB_PORT:-3000}', '3000')];
      })
    );
    expect(env.NEXT_PUBLIC_APP_URL).toBe('http://127.0.0.1.nip.io:3000');
    expect(resolveDeploymentOrigin(env)).toEqual({
      environment: 'local',
      origin: env.NEXT_PUBLIC_APP_URL,
    });
  });
  it.each([
    'ci.yml',
    'e2e-pr.yml',
    'pilot-gate.yml',
    'e2e-nightly.yml',
    'release-candidate.yml',
    'multi-agent-pr-hardening.yml',
  ])('%s starts on its existing loopback door', file => {
    const env = workflowUrls(file);
    expect(env).toEqual({ NEXT_PUBLIC_APP_URL: LOCAL, BETTER_AUTH_URL: LOCAL });
    // Playwright also supplies its independent routing host; it cannot select the door.
    expect(resolveDeploymentOrigin({ ...env, IDA_HOST: 'ida.127.0.0.1.nip.io:3000' })).toEqual({
      environment: 'local',
      origin: LOCAL,
    });
  });

  it('Playwright external mode retains the loopback door while Docker serves its configured nip.io door', () => {
    const playwright = source('apps/web/playwright.config.ts');
    const network = source('apps/web/playwright-network.ts');
    const webserver = source('scripts/e2e-webserver.sh');
    expect(playwright).toContain("process.env.PW_EXTERNAL_SERVER === '1'");
    expect(playwright).toContain('process.env.NEXT_PUBLIC_APP_URL = BASE_URL');
    expect(network).toContain("const host = '127.0.0.1'");
    expect(webserver).toContain('BASE_URL="${NEXT_PUBLIC_APP_URL:-http://${HOSTNAME}:${PORT}}"');
    expect(resolveDeploymentOrigin(local).origin).toBe('http://127.0.0.1:3000');
    // The z620 pilot script selects a task-owned port in this range on that same loopback host.
    expect(source('scripts/ci/z620-pilot-run.mjs')).toContain(
      'const baseUrl = `http://127.0.0.1:${port}`'
    );
    for (const port of [3100, 3199]) {
      const origin = `http://127.0.0.1:${port}`;
      expect(
        resolveDeploymentOrigin({ NEXT_PUBLIC_APP_URL: origin, BETTER_AUTH_URL: origin }).origin
      ).toBe(origin);
    }
  });

  it('OD17 uses build.invalid only for building and refuses it as a runtime destination', () => {
    const env = workflowUrls('od17-preview-canary.yml');
    expect(env.NEXT_PUBLIC_APP_URL).toBe('https://build.invalid');
    expect(() => resolveDeploymentOrigin(env)).toThrow('local_door');
  });

  it('Vercel preview runtime requires the staging door, auth agreement and IDA_HOST', () => {
    expect(resolveDeploymentOrigin(preview)).toEqual({ environment: 'staging', origin: STAGING });
    for (const key of ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL', 'IDA_HOST']) {
      expect(() => resolveDeploymentOrigin({ ...preview, [key]: undefined })).toThrow();
    }
    expect(() => resolveDeploymentOrigin({ ...preview, KS_HOST: preview.IDA_HOST })).toThrow();
  });

  it('non-Vercel staging URL is staging and requires full configuration at runtime', () => {
    const env = { NEXT_PUBLIC_APP_URL: STAGING, BETTER_AUTH_URL: STAGING };
    expect(() => resolveDeploymentOrigin(env)).toThrow('IDA_HOST');
    expect(resolveDeploymentOrigin({ ...env, IDA_HOST: preview.IDA_HOST })).toEqual({
      environment: 'staging',
      origin: STAGING,
    });
  });

  it('Vercel production runtime refuses destinations until the owner cutover agrees', () => {
    const env = {
      VERCEL_ENV: 'production',
      NEXT_PUBLIC_APP_URL: PRODUCTION,
      BETTER_AUTH_URL: PRODUCTION,
    };
    expect(resolveDeploymentOrigin(env)).toEqual({ environment: 'production', origin: PRODUCTION });
    for (const key of ['NEXT_PUBLIC_APP_URL', 'BETTER_AUTH_URL', 'NEXT_PUBLIC_SITE_URL']) {
      expect(() =>
        resolveDeploymentOrigin({ ...env, [key]: 'https://www.interdomestik.com' })
      ).toThrow();
    }
  });

  it('keeps placeholder and mismatched local URLs refused as actual destinations', () => {
    for (const origin of [
      'https://build.invalid',
      'https://www.interdomestik.com',
      'http://192.168.1.2:3000',
    ]) {
      expect(() =>
        resolveDeploymentOrigin({ NEXT_PUBLIC_APP_URL: origin, BETTER_AUTH_URL: origin })
      ).toThrow('local_door');
    }
    for (const key of ['BETTER_AUTH_URL', 'NEXT_PUBLIC_SITE_URL']) {
      expect(() => resolveDeploymentOrigin({ ...local, [key]: 'http://localhost:3000' })).toThrow(
        key
      );
    }
  });
});
