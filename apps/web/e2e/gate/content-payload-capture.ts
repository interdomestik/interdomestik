import { expect, type APIResponse, type Page, type Route } from '@playwright/test';

export interface ContentPayloadCapture {
  readonly checkedPayloadCount: number;
}

interface ContentPayloadCaptureOptions {
  matches: (url: URL) => boolean;
  sentinels: readonly string[];
}

interface CaptureState {
  checkedPayloadCount: number;
  failures: string[];
  removingRoutes: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isReleasedRouteError(error: unknown): boolean {
  return /already handled|\bclosed\b/i.test(errorMessage(error));
}

async function checkedResponse(route: Route, sentinels: readonly string[]): Promise<APIResponse> {
  // Read before delivery: Chromium can discard an interrupted refresh response's body.
  const response = await route.fetch({ maxRedirects: 0 });
  const payload = await response.text();
  for (const sentinel of sentinels) {
    if (payload.includes(sentinel)) throw new Error(`forbidden sentinel: ${sentinel}`);
  }
  const status = response.status();
  if (status >= 300 && status < 400) {
    const location = response.headers()['location'] ?? '(no location)';
    // These surfaces must resolve directly; redirected browser hops bypass routing.
    throw new Error(`unexpected redirect ${status} -> ${location}`);
  }
  return response;
}

async function deliverRoute(
  deliver: () => Promise<void>,
  bodyChecked: boolean,
  url: string,
  state: CaptureState
): Promise<void> {
  try {
    await deliver();
  } catch (error) {
    // unroute can release a handler that started during removal. Its checked body
    // remains evidence, but fetch/read/sentinel/redirect failures are never ignored.
    if (bodyChecked && state.removingRoutes && isReleasedRouteError(error)) return;
    state.failures.push(`${url}: response delivery failed: ${errorMessage(error)}`);
  }
}

async function capturePayload(
  route: Route,
  sentinels: readonly string[],
  state: CaptureState
): Promise<void> {
  const url = route.request().url();
  let response: APIResponse;
  try {
    response = await checkedResponse(route, sentinels);
  } catch (error) {
    state.failures.push(`${url}: body check failed: ${errorMessage(error)}`);
    await deliverRoute(() => route.abort(), false, url, state);
    return;
  }
  state.checkedPayloadCount++;
  // Preserve status, headers and HTML/Flight bytes, including notFound responses.
  // Buffering changes chunk timing; callers exercise completed rendering and focus.
  await deliverRoute(() => route.fulfill({ response }), true, url, state);
}

async function drainCaptures(pending: readonly Promise<void>[]): Promise<void> {
  let observedCount: number;
  do {
    observedCount = pending.length;
    // Array iteration also visits entries appended while an earlier task is awaited.
    for (const task of pending) await task;
  } while (pending.length !== observedCount);
}

/** Inspect every matching HTML/Flight payload before delivery throughout a visit. */
export async function withContentPayloadCapture<T>(
  page: Page,
  { matches, sentinels }: ContentPayloadCaptureOptions,
  visit: (capture: ContentPayloadCapture) => Promise<T>
): Promise<T> {
  const state: CaptureState = {
    checkedPayloadCount: 0,
    failures: [],
    removingRoutes: false,
  };
  const pending: Promise<void>[] = [];
  const capture = (route: Route): Promise<void> => {
    // Register a rejection handler immediately and return the same tracked promise.
    const task = capturePayload(route, sentinels, state).catch(error => {
      state.failures.push(`capture handler failed: ${errorMessage(error)}`);
    });
    pending.push(task);
    return task;
  };
  await page.route(matches, capture);
  try {
    return await visit({
      get checkedPayloadCount() {
        return state.checkedPayloadCount;
      },
    });
  } finally {
    // Keep interception installed until all known handlers finish and the list is stable.
    await drainCaptures(pending);
    state.removingRoutes = true;
    try {
      await page.unroute(matches, capture);
    } finally {
      // Include handlers that started in the removal window, without floating promises.
      await drainCaptures(pending);
      expect(state.failures, 'all matching response bodies were checked and delivered').toEqual([]);
    }
  }
}
