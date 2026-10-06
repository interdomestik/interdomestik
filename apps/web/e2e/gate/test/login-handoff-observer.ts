import { type Page } from '@playwright/test';

export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export async function passiveRoleObserver(
  page: Page,
  origin: string,
  expectedRole: string,
  admin: boolean
) {
  const cdp = await page.context().newCDPSession(page);
  const requests = new Set<string>();
  const responses = new Map<string, number>();
  let verdict: { status: number; validated: boolean; bodyRead: boolean } | null = null;
  try {
    await cdp.send('Network.enable');
    await cdp.send('Network.configureDurableMessages', {
      maxTotalBufferSize: 4 * 1024 * 1024,
      maxResourceBufferSize: 128 * 1024,
    });
  } catch {
    await cdp.detach();
    throw new Error('passive durable role observer unsupported');
  }
  cdp.on('Network.requestWillBeSent', event => {
    const url = new URL(event.request.url);
    if (
      event.request.method === 'GET' &&
      url.origin === origin &&
      url.pathname === '/api/auth/login-session' &&
      !url.search
    )
      requests.add(event.requestId);
    else requests.delete(event.requestId);
  });
  cdp.on('Network.responseReceived', event => {
    const url = new URL(event.response.url);
    if (
      requests.has(event.requestId) &&
      url.origin === origin &&
      url.pathname === '/api/auth/login-session' &&
      !url.search
    )
      responses.set(event.requestId, event.response.status);
  });
  cdp.on('Network.loadingFinished', async event => {
    const status = responses.get(event.requestId);
    requests.delete(event.requestId);
    responses.delete(event.requestId);
    if (status === undefined) return;
    try {
      const result = await cdp.send('Network.getResponseBody', { requestId: event.requestId });
      const body = record(
        JSON.parse(
          result.base64Encoded ? Buffer.from(result.body, 'base64').toString('utf8') : result.body
        )
      );
      verdict = {
        status,
        bodyRead: true,
        validated: body?.role === expectedRole && (!admin || body?.hasAdminAccess === true),
      };
    } catch {
      verdict = { status, bodyRead: false, validated: false };
    }
  });
  cdp.on('Network.loadingFailed', event => {
    if (requests.has(event.requestId)) verdict = { status: 0, bodyRead: false, validated: false };
    requests.delete(event.requestId);
    responses.delete(event.requestId);
  });
  return {
    read: () => verdict,
    async close() {
      requests.clear();
      responses.clear();
      verdict = null;
      try {
        await cdp.detach();
      } catch (error) {
        if (!(error instanceof Error) || !error.message.includes('No session with given id'))
          throw new Error('passive observer detach failed');
      }
    },
  };
}
