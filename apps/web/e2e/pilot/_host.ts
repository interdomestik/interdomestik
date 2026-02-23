import type { TestInfo } from '@playwright/test';

const DEFAULT_MK_HOST = 'mk.127.0.0.1.nip.io:3000';

export function resolveActorHost(testInfo: TestInfo): string {
  if (process.env.C2_ACTOR_HOST) {
    return process.env.C2_ACTOR_HOST;
  }

  const forwardedHost = testInfo.project.use.extraHTTPHeaders?.['x-forwarded-host'];
  if (typeof forwardedHost === 'string' && forwardedHost.trim().length > 0) {
    return forwardedHost;
  }

  const baseURL = testInfo.project.use.baseURL?.toString();
  if (baseURL) {
    try {
      return new URL(baseURL).host;
    } catch {
      // Ignore malformed baseURL and fall through to env/default fallback.
    }
  }

  return process.env.MK_HOST ?? DEFAULT_MK_HOST;
}

export function isAlActorHost(host: string): boolean {
  return host.toLowerCase().startsWith('al.');
}
