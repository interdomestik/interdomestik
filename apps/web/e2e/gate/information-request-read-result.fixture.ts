import type { APIResponse, Page, Request, Route } from '@playwright/test';
import {
  ReadSeamError,
  failInformationRequestRead,
  requireListedInformationRequestRead,
  verifyEmptyInformationRequestRead,
  type ReadResultTarget,
} from './information-request-read-projection.fixture';

export {
  failInformationRequestRead,
  verifyEmptyInformationRequestRead,
  type ReadResultAudience,
  type ReadResultTarget,
} from './information-request-read-projection.fixture';

export type ReadSeamMode = {
  readonly kind: 'failure' | 'passthrough';
  /** Keeps the actual GET response pending until release(). */
  readonly hold?: boolean;
  /** Passthrough only: requires the success payload to carry exactly one empty requests list. */
  readonly verifyEmpty?: boolean;
  /**
   * Failure only and never held: opens a persistent initial phase in which every eligible read
   * that ENTERS before finishInitial() is fetched, validated and failed. Nothing is cancelled.
   */
  readonly initialFailure?: true;
};

/** Metadata only: counts and flags, never URLs, headers, cookies or bodies. */
export type ReadSeamCounts = {
  eligible: number;
  prefetchIgnored: number;
  unarmed: number;
  held: number;
  /** Totals over the initial phase and deliberate reads; background traffic is variable. */
  failed: number;
  passed: number;
  errors: number;
  initialNavigation: number;
  backgroundInitial: number;
  initialOutstanding: number;
  initialOpen: boolean;
  deliberateFailed: number;
  deliberatePassed: number;
  awaitingRelease: boolean;
};

export type InformationRequestReadSeam = {
  arm(mode: ReadSeamMode): void;
  /** Closes the initial phase now; resolves once every read that entered it has settled. */
  finishInitial(): Promise<void>;
  release(): void;
  counts(): ReadSeamCounts;
  assertNoError(): void;
  restore(): Promise<void>;
};

type Gate = { promise: Promise<void>; open: () => void; isOpen: () => boolean };

function createGate(): Gate {
  let opened = false;
  let resolveGate: () => void = () => undefined;
  const promise = new Promise<void>(resolve => {
    resolveGate = resolve;
  });
  return {
    promise,
    open: () => {
      opened = true;
      resolveGate();
    },
    isOpen: () => opened,
  };
}

type Classification = 'ignore' | 'prefetch' | 'read';

// Header presence is the only thing inspected; cookies, other headers and bodies are never read.
function classify(request: Request): Classification {
  const headers = request.headers();
  if (request.method() !== 'GET' || headers['rsc'] !== '1') return 'ignore';
  const prefetch = 'next-router-prefetch' in headers || 'next-router-segment-prefetch' in headers;
  return prefetch ? 'prefetch' : 'read';
}

type Slot = { mode: ReadSeamMode; gate: Gate | null; held: boolean };
type InitialPhase = { entered: number };

/**
 * Test-only transport seam for the information-request read of one case detail. It handles
 * GET + RSC:1 requests for the exact detail pathname only, never prefetches, writes or HTML. A
 * deliberate arm applies one mode to one request: fetch the actual response, optionally hold it,
 * then fulfil it unchanged (passthrough) or with only `requests` nulled (failure). The initial
 * phase fails every read that enters it. Phase and slot are captured at request entry, so a late
 * initial settlement never touches the deliberate arm or active slot; nothing is cancelled and
 * finishInitial() awaits every initial read that already entered.
 * Any transformation or verification error aborts that one request (never releases the real
 * response) and stores a payload-free error for assertNoError().
 */
export async function installInformationRequestReadSeam(
  page: Page,
  target: ReadResultTarget
): Promise<InformationRequestReadSeam> {
  const counts = {
    eligible: 0,
    prefetchIgnored: 0,
    unarmed: 0,
    held: 0,
    failed: 0,
    passed: 0,
    errors: 0,
    initialNavigation: 0,
    backgroundInitial: 0,
    deliberateFailed: 0,
    deliberatePassed: 0,
  };
  let initial: InitialPhase | null = null;
  const outstanding = new Set<Promise<void>>();
  let armed: Slot | null = null;
  let active: Slot | null = null;
  let storedError: Error | null = null;

  // True only while the one active request's held response still waits for release().
  const awaiting = (): boolean => active?.held === true && active.gate?.isOpen() === false;

  // Opens the armed or active gate; an early release can never strand a later hold.
  const release = (): void => {
    (armed ?? active)?.gate?.open();
  };

  const fetchRsc = async (route: Route): Promise<APIResponse> => {
    const response = await route.fetch();
    const contentType = response.headers()['content-type'] ?? '';
    if (!response.ok() || !contentType.includes('text/x-component')) {
      throw new ReadSeamError('S7 read-result seam saw a failed or non-RSC response');
    }
    return response;
  };

  const abort = async (route: Route, error: unknown): Promise<void> => {
    counts.errors += 1;
    storedError ??=
      error instanceof ReadSeamError
        ? error
        : new ReadSeamError('S7 read-result seam transport failed');
    await route.abort('failed').catch(() => undefined);
  };

  // Never rejects: the outcome is the failed projection or a stored error plus abort.
  const settleInitial = async (route: Route, navigation: boolean): Promise<void> => {
    try {
      const response = await fetchRsc(route);
      const text = await response.text();
      requireListedInformationRequestRead(text, target);
      await route.fulfill({ response, body: failInformationRequestRead(text, target) });
      counts.failed += 1;
      if (navigation) counts.initialNavigation += 1;
      else counts.backgroundInitial += 1;
    } catch (error) {
      await abort(route, error);
    }
  };

  const settle = async (route: Route, slot: Slot): Promise<void> => {
    const response = await fetchRsc(route);
    let body: string | undefined;
    if (slot.mode.kind === 'failure') {
      body = failInformationRequestRead(await response.text(), target);
    } else if (slot.mode.verifyEmpty) {
      verifyEmptyInformationRequestRead(await response.text(), target);
    }
    if (slot.gate) {
      counts.held += 1;
      slot.held = true;
      await slot.gate.promise;
    }
    if (body === undefined) {
      await route.fulfill({ response });
      counts.passed += 1;
      counts.deliberatePassed += 1;
    } else {
      await route.fulfill({ response, body });
      counts.failed += 1;
      counts.deliberateFailed += 1;
    }
  };

  const handler = async (route: Route): Promise<void> => {
    const kind = classify(route.request());
    if (kind === 'ignore') return route.fallback();
    if (kind === 'prefetch') {
      counts.prefetchIgnored += 1;
      return route.fallback();
    }
    counts.eligible += 1;
    if (initial) {
      // Captured synchronously at entry: this read stays initial however late it settles.
      const navigation = initial.entered === 0;
      initial.entered += 1;
      const settled = settleInitial(route, navigation);
      outstanding.add(settled);
      try {
        await settled;
      } finally {
        outstanding.delete(settled);
      }
      return;
    }
    const slot = armed;
    if (!slot) {
      counts.unarmed += 1;
      return route.fallback();
    }
    armed = null;
    active = slot;
    try {
      await settle(route, slot);
    } catch (error) {
      await abort(route, error);
    } finally {
      if (active === slot) active = null;
    }
  };

  const finishInitial = async (): Promise<void> => {
    initial = null;
    await Promise.all([...outstanding]);
  };

  const matcher = (url: URL): boolean => url.pathname === target.pathname;
  await page.route(matcher, handler);
  return {
    arm(mode) {
      if (initial || armed || active) {
        throw new ReadSeamError('S7 read-result seam is already armed');
      }
      if (!mode.initialFailure) {
        armed = { mode, gate: mode.hold ? createGate() : null, held: false };
      } else if (mode.kind !== 'failure' || mode.hold || mode.verifyEmpty) {
        throw new ReadSeamError('S7 read-result seam initial phase is failure-only and unheld');
      } else {
        initial = { entered: 0 };
      }
    },
    finishInitial,
    release,
    counts: () => ({
      ...counts,
      initialOutstanding: outstanding.size,
      initialOpen: initial !== null,
      awaitingRelease: awaiting(),
    }),
    assertNoError() {
      if (storedError) throw storedError;
    },
    async restore() {
      release();
      armed = null;
      const drained = finishInitial();
      await page.unroute(matcher, handler);
      await drained;
    },
  };
}

/** Counts POST requests whose body contains `needle`; never stores or prints any body. */
export function watchPostBodies(page: Page, needle: string): () => number {
  let seen = 0;
  page.on('request', request => {
    if (request.method() === 'POST' && (request.postData() ?? '').includes(needle)) seen += 1;
  });
  return () => seen;
}

/** Two animation frames: orders the browser behind any request it has just issued. */
export function settleFrames(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>(resolve => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}
