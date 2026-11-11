import { expect, type Page, type Request, type Response, type Route } from '@playwright/test';

export interface ContentPayloadCapture {
  readonly checkedPayloadCount: number;
  checkedPayload: (request: Request | Response) => Promise<string>;
  settled: () => Promise<void>;
}

interface ContentPayloadCaptureOptions {
  matches: (url: URL, request: Request) => boolean;
  sentinels: readonly string[];
}

interface CaptureState {
  accepting: boolean;
  checkedPayloadCount: number;
  failures: string[];
  open: Set<Request>;
  actions: Set<Request>;
  onActionTerminal?: () => void;
  actionFailures: Map<Request, string[]>;
  fulfilled: WeakSet<Request>;
}

const BODY_READ_TIMEOUT_MS = 30_000;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withCaptureFailures(error: unknown, failures: readonly string[]): unknown {
  // Keep the visit's own failure primary; capture failures are added context.
  if (failures.length === 0) return error;
  const details = `\nContent payload capture failures:\n${failures.join('\n')}`;
  if (!(error instanceof Error)) return new Error(`${errorMessage(error)}${details}`);
  error.message += details;
  return error;
}

async function readBody<T>(read: () => Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`body not complete after ${BODY_READ_TIMEOUT_MS} ms`)),
      BODY_READ_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([read(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function capturePayload<T extends string | Buffer>(
  response: Pick<Response, 'status' | 'headers'>,
  read: () => Promise<T>,
  sentinels: readonly string[],
  state: CaptureState
): Promise<T> {
  const status = response.status();
  if (status >= 300 && status < 400) {
    const location = response.headers()['location'] ?? '(no location)';
    throw new Error(`unexpected redirect ${status} -> ${location}`);
  }
  // Check the original bytes, never a replay of the request.
  const payload = await readBody(read);
  for (const sentinel of sentinels) {
    if (payload.toString().includes(sentinel)) throw new Error(`forbidden sentinel: ${sentinel}`);
  }
  state.checkedPayloadCount++;
  return payload;
}

async function drainCaptures(pending: readonly Promise<void>[]): Promise<void> {
  let settled = 0;
  while (settled < pending.length) {
    const observedCount = pending.length;
    // Tracked tasks never reject; include tasks appended while this batch ran.
    await Promise.all(pending.slice(settled));
    settled = observedCount;
  }
}

interface CaptureListeners {
  onRequest: (request: Request) => void;
  onResponse: (response: Response) => void;
  onFailed: (request: Request) => void;
  onFinished: (request: Request) => void;
}

function isAction(request: Request): boolean {
  return (
    request.resourceType() === 'fetch' &&
    request.method() === 'POST' &&
    'next-action' in request.headers()
  );
}

function attach(page: Page, listeners: CaptureListeners): void {
  page.on('request', listeners.onRequest);
  page.on('response', listeners.onResponse);
  page.on('requestfailed', listeners.onFailed);
  page.on('requestfinished', listeners.onFinished);
}

function detach(page: Page, listeners: CaptureListeners): void {
  page.off('request', listeners.onRequest);
  page.off('response', listeners.onResponse);
  page.off('requestfailed', listeners.onFailed);
  page.off('requestfinished', listeners.onFinished);
}

async function waitForActions(state: CaptureState): Promise<void> {
  if (state.actions.size === 0) return;
  const deadline = Date.now() + 10_000;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await new Promise<void>(resolve => {
      state.onActionTerminal = () => {
        if (state.actions.size === 0) resolve();
      };
      timer = setTimeout(resolve, Math.max(0, deadline - Date.now()));
    });
  } finally {
    clearTimeout(timer);
    state.onActionTerminal = undefined;
  }
}

async function releaseCapture(
  page: Page,
  listeners: CaptureListeners,
  pending: readonly Promise<void>[],
  state: CaptureState,
  onRoute: (route: Route) => Promise<void>
): Promise<void> {
  try {
    // Stop traffic with the listeners attached so every matching request reaches a final state.
    await page.goto('about:blank');
  } catch (error) {
    state.failures.push(`capture cleanup failed: ${errorMessage(error)}`);
  }
  try {
    await page.unroute('**/*', onRoute);
  } catch (error) {
    state.failures.push(`capture unroute failed: ${errorMessage(error)}`);
  }
  state.accepting = false;
  // unroute does not wait for active handlers; retain all events until they settle.
  await drainCaptures(pending);
  await waitForActions(state);
  detach(page, listeners);
  await drainCaptures(pending);
  for (const [request, errors] of state.actionFailures) {
    for (const errorText of errors) {
      // Chromium 153 may report an abort after the checked bytes are fulfilled.
      if (errorText === 'net::ERR_ABORTED' && state.fulfilled.has(request)) continue;
      state.failures.push(`${request.url()}: request failed: ${errorText}`);
    }
  }
  for (const request of state.actions) {
    state.failures.push(`${request.url()}: action request never completed in the browser`);
  }
  for (const request of state.open) {
    state.failures.push(`${request.url()}: matching request never produced a response`);
  }
}

/**
 * Inspect matching bodies during a visit. Actions use one intercepted fetch whose checked bytes
 * are fulfilled to the browser; other responses use CDP. Failures fail the test.
 * The page is left on about:blank afterwards.
 */
export async function withContentPayloadCapture<T>(
  page: Page,
  { matches, sentinels }: ContentPayloadCaptureOptions,
  visit: (capture: ContentPayloadCapture) => Promise<T>
): Promise<T> {
  const state: CaptureState = {
    accepting: true,
    checkedPayloadCount: 0,
    failures: [],
    open: new Set(),
    actions: new Set(),
    actionFailures: new Map(),
    fulfilled: new WeakSet(),
  };
  const pending: Promise<void>[] = [];
  const payloads = new WeakMap<Request, Promise<string>>();
  const isMatch = (request: Request) => matches(new URL(request.url()), request);
  const track = (request: Request, payload: Promise<string>): Promise<void> => {
    payloads.set(request, payload);
    const task = payload.then(
      () => {},
      error => {
        state.failures.push(`${request.url()}: body check failed: ${errorMessage(error)}`);
      }
    );
    pending.push(task);
    return task;
  };
  const onRoute = (route: Route): Promise<void> => {
    const request = route.request();
    if (!state.accepting || !isMatch(request) || !isAction(request)) return route.fallback();
    state.actions.add(request);
    const payload = (async () => {
      try {
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
        const body = await capturePayload(response, () => response.body(), sentinels, state);
        await route.fulfill({ response, body });
        state.fulfilled.add(request);
        return body.toString('utf8');
      } catch (error) {
        await route.abort().catch(abortError => {
          state.failures.push(`${request.url()}: abort failed: ${errorMessage(abortError)}`);
        });
        throw error;
      }
    })();
    return track(request, payload);
  };
  const listeners: CaptureListeners = {
    onRequest: request => {
      if (!isMatch(request)) return;
      if (!isAction(request)) state.open.add(request);
      else if (state.accepting) state.actions.add(request);
    },
    onResponse: response => {
      const request = response.request();
      // Intercepted actions own their bytes even if Chromium later loses its CDP body.
      if (!isMatch(request)) return;
      if (isAction(request)) {
        // Gate E2E leaves NEXT_PUBLIC_ENABLE_PWA unset, so no service worker controls pages.
        // Fail closed if that changes or an action otherwise bypasses its route.
        if (!payloads.has(request)) {
          state.failures.push(`${request.url()}: action response bypassed interception`);
        }
        return;
      }
      state.open.delete(request);
      // Track exactly one task per matching response and handle rejection immediately.
      track(
        request,
        capturePayload(response, () => response.text(), sentinels, state)
      );
    },
    onFinished: request => {
      state.actions.delete(request);
      state.onActionTerminal?.();
    },
    onFailed: request => {
      if (!isMatch(request)) return;
      const errorText = request.failure()?.errorText ?? '(no error text)';
      if (isAction(request)) {
        state.actions.delete(request);
        state.onActionTerminal?.();
        const errors = state.actionFailures.get(request) ?? [];
        errors.push(errorText);
        state.actionFailures.set(request, errors);
      } else {
        state.open.delete(request);
        state.failures.push(`${request.url()}: request failed: ${errorText}`);
      }
    },
  };
  attach(page, listeners);
  const view: ContentPayloadCapture = {
    get checkedPayloadCount() {
      return state.checkedPayloadCount;
    },
    checkedPayload: captured => {
      const request = 'request' in captured ? captured.request() : captured;
      const payload = payloads.get(request);
      if (!payload) throw new Error(`Request was not captured: ${request.url()}`);
      return payload;
    },
    // Response events precede body completion; callers drain before reading the count.
    settled: () => drainCaptures(pending),
  };
  const result = await (async () => {
    await page.route('**/*', onRoute);
    return await visit(view);
  })().catch(async (error: unknown) => {
    await releaseCapture(page, listeners, pending, state, onRoute);
    throw withCaptureFailures(error, state.failures);
  });
  // A successful visit must preserve pending bodies before cleanup can abort their requests.
  await drainCaptures(pending);
  await releaseCapture(page, listeners, pending, state, onRoute);
  expect(state.failures, 'every matching response body was received and checked').toEqual([]);
  return result;
}
