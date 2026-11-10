import { expect, type Page, type Request, type Response } from '@playwright/test';

export interface ContentPayloadCapture {
  readonly checkedPayloadCount: number;
  settled: () => Promise<void>;
}

interface ContentPayloadCaptureOptions {
  matches: (url: URL, request: Request) => boolean;
  sentinels: readonly string[];
}

interface CaptureState {
  checkedPayloadCount: number;
  failures: string[];
  open: Set<Request>;
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

async function readBody(response: Response): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`body not complete after ${BODY_READ_TIMEOUT_MS} ms`)),
      BODY_READ_TIMEOUT_MS
    );
  });
  try {
    return await Promise.race([response.text(), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function capturePayload(
  response: Response,
  sentinels: readonly string[],
  state: CaptureState
): Promise<void> {
  const status = response.status();
  if (status >= 300 && status < 400) {
    const location = response.headers()['location'] ?? '(no location)';
    throw new Error(`unexpected redirect ${status} -> ${location}`);
  }
  // Fail closed: only the bytes the browser actually received count as evidence. No replay.
  const payload = await readBody(response);
  for (const sentinel of sentinels) {
    if (payload.includes(sentinel)) throw new Error(`forbidden sentinel: ${sentinel}`);
  }
  state.checkedPayloadCount++;
}

async function drainCaptures(pending: readonly Promise<void>[], settled = 0): Promise<void> {
  if (settled === pending.length) return;
  const observedCount = pending.length;
  // Tracked tasks never reject; recurse to include tasks appended while this batch ran.
  await Promise.all(pending.slice(settled));
  await drainCaptures(pending, observedCount);
}

interface CaptureListeners {
  onRequest: (request: Request) => void;
  onResponse: (response: Response) => void;
  onFailed: (request: Request) => void;
}

function attach(page: Page, listeners: CaptureListeners): void {
  page.on('request', listeners.onRequest);
  page.on('response', listeners.onResponse);
  page.on('requestfailed', listeners.onFailed);
}

function detach(page: Page, listeners: CaptureListeners): void {
  page.off('request', listeners.onRequest);
  page.off('response', listeners.onResponse);
  page.off('requestfailed', listeners.onFailed);
}

async function releaseCapture(
  page: Page,
  listeners: CaptureListeners,
  pending: readonly Promise<void>[],
  state: CaptureState
): Promise<void> {
  try {
    // Stop traffic with the listeners attached so every matching request reaches a final state.
    await page.goto('about:blank');
  } catch (error) {
    state.failures.push(`capture cleanup failed: ${errorMessage(error)}`);
  }
  await drainCaptures(pending);
  detach(page, listeners);
  for (const request of state.open) {
    state.failures.push(`${request.url()}: matching request never produced a response`);
  }
}

/**
 * Inspect every matching response body the browser receives during a visit, without interception
 * or replay. Every matching request must end in a checked response; failures fail the test.
 * The page is left on about:blank afterwards.
 */
export async function withContentPayloadCapture<T>(
  page: Page,
  { matches, sentinels }: ContentPayloadCaptureOptions,
  visit: (capture: ContentPayloadCapture) => Promise<T>
): Promise<T> {
  const state: CaptureState = { checkedPayloadCount: 0, failures: [], open: new Set() };
  const pending: Promise<void>[] = [];
  const isMatch = (request: Request) => matches(new URL(request.url()), request);
  const listeners: CaptureListeners = {
    onRequest: request => {
      if (isMatch(request)) state.open.add(request);
    },
    onResponse: response => {
      const request = response.request();
      if (!isMatch(request)) return;
      state.open.delete(request);
      // Track exactly one task per matching response and handle rejection immediately.
      const task = capturePayload(response, sentinels, state).catch(error => {
        state.failures.push(`${response.url()}: body check failed: ${errorMessage(error)}`);
      });
      pending.push(task);
    },
    onFailed: request => {
      if (!isMatch(request)) return;
      state.open.delete(request);
      state.failures.push(`${request.url()}: request failed: ${request.failure()?.errorText}`);
    },
  };
  attach(page, listeners);
  const view: ContentPayloadCapture = {
    get checkedPayloadCount() {
      return state.checkedPayloadCount;
    },
    // Response events precede body completion; callers drain before reading the count.
    settled: () => drainCaptures(pending),
  };
  const result = await visit(view).catch(async (error: unknown) => {
    await releaseCapture(page, listeners, pending, state);
    throw withCaptureFailures(error, state.failures);
  });
  await releaseCapture(page, listeners, pending, state);
  expect(state.failures, 'every matching response body was received and checked').toEqual([]);
  return result;
}
