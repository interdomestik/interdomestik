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
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withCaptureFailures(error: unknown, failures: readonly string[]): unknown {
  // Keep the visit's own failure primary; capture failures are added context.
  if (failures.length === 0 || !(error instanceof Error)) return error;
  error.message += `\nContent payload capture failures:\n${failures.join('\n')}`;
  return error;
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
  url: string,
  state: CaptureState
): Promise<void> {
  try {
    await deliver();
  } catch (error) {
    // Fail closed: an undelivered route could let the browser receive an unchecked response.
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
    await deliverRoute(() => route.abort(), url, state);
    return;
  }
  state.checkedPayloadCount++;
  // Preserve status, headers and HTML/Flight bytes, including notFound responses.
  // Buffering changes chunk timing; callers exercise completed rendering and focus.
  await deliverRoute(() => route.fulfill({ response }), url, state);
}

async function drainCaptures(pending: readonly Promise<void>[], settled = 0): Promise<void> {
  if (settled === pending.length) return;
  const observedCount = pending.length;
  // Tracked tasks never reject; recurse to include handlers appended while this batch ran.
  await Promise.all(pending.slice(settled));
  await drainCaptures(pending, observedCount);
}

async function releaseCapture(
  page: Page,
  matches: (url: URL) => boolean,
  capture: (route: Route) => Promise<void>,
  pending: readonly Promise<void>[],
  state: CaptureState
): Promise<void> {
  try {
    // Stop the document's traffic while interception is still installed, so removing the
    // route can release no outstanding request to the network unchecked.
    await page.goto('about:blank');
    await drainCaptures(pending);
    const intercepted = pending.length;
    await page.unroute(matches, capture);
    await drainCaptures(pending);
    if (pending.length !== intercepted) {
      state.failures.push('a matching request was intercepted during route removal');
    }
  } catch (error) {
    state.failures.push(`capture cleanup failed: ${errorMessage(error)}`);
  }
}

/**
 * Inspect every matching HTML/Flight payload before delivery throughout a visit.
 * The page is left on about:blank afterwards.
 */
export async function withContentPayloadCapture<T>(
  page: Page,
  { matches, sentinels }: ContentPayloadCaptureOptions,
  visit: (capture: ContentPayloadCapture) => Promise<T>
): Promise<T> {
  const state: CaptureState = {
    checkedPayloadCount: 0,
    failures: [],
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
  const view: ContentPayloadCapture = {
    get checkedPayloadCount() {
      return state.checkedPayloadCount;
    },
  };
  const result = await visit(view).catch(async (error: unknown) => {
    await releaseCapture(page, matches, capture, pending, state);
    throw withCaptureFailures(error, state.failures);
  });
  await releaseCapture(page, matches, capture, pending, state);
  expect(state.failures, 'all matching response bodies were checked and delivered').toEqual([]);
  return result;
}
