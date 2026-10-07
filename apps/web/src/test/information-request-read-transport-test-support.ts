import type { Page, Route } from '@playwright/test';
import { vi } from 'vitest';
import {
  installInformationRequestReadSeam,
  type InformationRequestReadSeam,
} from '../../e2e/gate/information-request-read-result.fixture';
import { TARGET, props, sample } from './information-request-read-result-test-support';

// Mocked Page/Route transport for the real seam: no browser, auth, network or payload output.
export type Handler = (route: Route) => Promise<void>;
export type Matcher = (url: URL) => boolean;
export type FakeResponse = { ok: boolean; contentType: string; body: string };
export type FakeRequest = { method: string; headers: Record<string, string> };

export const GET_RSC: FakeRequest = { method: 'GET', headers: { rsc: '1' } };
export const emptyBody = (overrides: Record<string, unknown> = {}): string =>
  sample(props({ requests: [], ...overrides }));
export const rsc = (body: string, overrides: Partial<FakeResponse> = {}): FakeResponse => ({
  ok: true,
  contentType: 'text/x-component',
  body,
  ...overrides,
});

export async function mount() {
  const registered: { matcher?: Matcher; handler?: Handler } = {};
  const page = {
    route: vi.fn(async (matcher: Matcher, handler: Handler) => {
      Object.assign(registered, { matcher, handler });
    }),
    unroute: vi.fn(async (_matcher: Matcher, _handler: Handler) => undefined),
  };
  const seam = await installInformationRequestReadSeam(page as unknown as Page, TARGET);
  const { matcher, handler } = registered;
  if (!matcher || !handler) throw new Error('expected the seam to register its route');
  return { seam, page, matcher, handler };
}

export function fakeRoute(response: FakeResponse, request: FakeRequest = GET_RSC) {
  const fetched = {
    ok: () => response.ok,
    headers: () => ({ 'content-type': response.contentType }),
    text: async () => response.body,
  };
  return {
    fetched,
    request: () => ({ method: () => request.method, headers: () => request.headers }),
    fetch: vi.fn(async () => fetched),
    fulfill: vi.fn(async (_options: { response: unknown; body?: string }) => undefined),
    fallback: vi.fn(async () => undefined),
    abort: vi.fn(async (_errorCode?: string) => undefined),
  };
}
export type FakeRoute = ReturnType<typeof fakeRoute>;

export const send = (handler: Handler, route: FakeRoute): Promise<void> =>
  handler(route as unknown as Route);

export function errorOf(seam: InformationRequestReadSeam): string {
  try {
    seam.assertNoError();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return '';
}

/** Keeps the next actual fetch of `route` pending until the returned callback runs. */
export function deferFetch(route: FakeRoute): () => void {
  let respond: () => void = () => undefined;
  route.fetch.mockImplementationOnce(
    () =>
      new Promise<FakeRoute['fetched']>(resolve => {
        respond = () => resolve(route.fetched);
      })
  );
  return () => respond();
}
