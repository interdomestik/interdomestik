import { expect, type APIResponse, type Page, type Response } from '@playwright/test';

export interface ContentPayloadCapture {
  readonly checkedPayloadCount: number;
  settled: () => Promise<void>;
}

interface ContentPayloadCaptureOptions {
  matches: (url: URL) => boolean;
  sentinels: readonly string[];
}

interface CaptureState {
  checkedPayloadCount: number;
  failures: string[];
  bodyReads: string[];
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withCaptureFailures(error: unknown, state: CaptureState): unknown {
  // Keep the visit's own failure primary; capture failures are added context.
  if (state.failures.length === 0) return error;
  const details = `\nContent payload capture failures:\n${state.failures.join('\n')}\nBody sources:\n${state.bodyReads.join('\n')}`;
  if (!(error instanceof Error)) {
    return new Error(`${errorMessage(error)}${details}`, { cause: error });
  }
  error.message += details;
  return error;
}

function rejectRedirect(response: Response | APIResponse): void {
  const status = response.status();
  if (status >= 300 && status < 400) {
    const location = response.headers()['location'] ?? '(no location)';
    throw new Error(`unexpected redirect ${status} -> ${location}`);
  }
}

async function replayPayload(page: Page, response: Response): Promise<string> {
  // Passing the Request preserves method, headers (including RSC/router state) and body.
  // page.request shares the browser context's cookie jar; never follow replay redirects.
  const replay = await page.request.fetch(response.request(), {
    maxRedirects: 0,
    failOnStatusCode: false,
  });
  try {
    rejectRedirect(replay);
    return await replay.text();
  } finally {
    await replay.dispose();
  }
}

async function readPayload(page: Page, response: Response, state: CaptureState): Promise<string> {
  try {
    const payload = await response.text();
    state.bodyReads.push(`${response.url()}: browser body`);
    return payload;
  } catch (browserError) {
    // Chromium may discard a body when navigation or an aborted refresh interrupts it.
    state.bodyReads.push(`${response.url()}: request replay (${errorMessage(browserError)})`);
    try {
      return await replayPayload(page, response);
    } catch (replayError) {
      throw new Error(
        `browser body unavailable: ${errorMessage(browserError)}; request replay failed: ${errorMessage(replayError)}`
      );
    }
  }
}

async function capturePayload(
  page: Page,
  response: Response,
  sentinels: readonly string[],
  state: CaptureState
): Promise<void> {
  rejectRedirect(response);
  const payload = await readPayload(page, response, state);
  for (const sentinel of sentinels) {
    if (payload.includes(sentinel)) {
      state.failures.push(`${response.url()}: forbidden sentinel: ${sentinel}`);
    }
  }
  state.checkedPayloadCount++;
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
  capture: (response: Response) => void,
  pending: readonly Promise<void>[],
  state: CaptureState
): Promise<void> {
  try {
    // Stop traffic with the listener attached, including responses interrupted by navigation.
    await page.goto('about:blank');
  } catch (error) {
    state.failures.push(`capture cleanup failed: ${errorMessage(error)}`);
  }
  // Even failed navigation must drain tasks and detach the listener.
  await drainCaptures(pending);
  const observedCount = pending.length;
  page.off('response', capture);
  await drainCaptures(pending);
  if (pending.length !== observedCount) {
    state.failures.push('a matching response task appeared after listener removal');
  }
}

/**
 * Inspect every matching HTML/Flight response throughout a visit without interception.
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
    bodyReads: [],
  };
  const pending: Promise<void>[] = [];
  const capture = (response: Response): void => {
    if (!matches(new URL(response.url()))) return;
    // Track exactly one task per matching response and handle rejection immediately.
    const task = capturePayload(page, response, sentinels, state).catch(error => {
      state.failures.push(`${response.url()}: body check failed: ${errorMessage(error)}`);
    });
    pending.push(task);
  };
  page.on('response', capture);
  const view: ContentPayloadCapture = {
    get checkedPayloadCount() {
      return state.checkedPayloadCount;
    },
    // Response events precede body completion; callers must drain before reading the count.
    settled: () => drainCaptures(pending),
  };
  const result = await visit(view).catch(async (error: unknown) => {
    await releaseCapture(page, capture, pending, state);
    throw withCaptureFailures(error, state);
  });
  await releaseCapture(page, capture, pending, state);
  expect(
    state.failures,
    `all matching response bodies were checked\nBody sources:\n${state.bodyReads.join('\n')}`
  ).toEqual([]);
  return result;
}
