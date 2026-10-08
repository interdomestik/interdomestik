import type { Page, Route } from '@playwright/test';
import {
  AdminClaimsReadSeamError,
  failAdminClaimsRead,
  readAdminClaimsResult,
  invalid,
} from './admin-claims-read-projection.fixture';
export {
  ADMIN_CLAIMS_READ,
  AdminClaimsReadSeamError,
  failAdminClaimsRead,
  readAdminClaimsResult,
} from './admin-claims-read-projection.fixture';

export type ReadClassification = 'ignore' | 'prefetch' | 'read';

/** Header presence is the only thing inspected; cookies, other headers and bodies are never read. */
export function classifyRead(
  method: string,
  headers: Readonly<Record<string, string>>
): ReadClassification {
  if (method !== 'GET' || headers['rsc'] !== '1') return 'ignore';
  const prefetch = 'next-router-prefetch' in headers || 'next-router-segment-prefetch' in headers;
  return prefetch ? 'prefetch' : 'read';
}

export type AdminClaimsReadMode = {
  readonly kind: 'failure' | 'passthrough';
  /** Keeps the actual GET response pending until release(). */
  readonly hold?: boolean;
};

/** Metadata only: counts and flags, never URLs, headers, cookies or bodies. */
export type AdminClaimsReadCounts = {
  eligible: number;
  prefetchIgnored: number;
  unarmed: number;
  held: number;
  failed: number;
  passed: number;
  errors: number;
  awaitingRelease: boolean;
};

export type AdminClaimsReadSeam = {
  arm(mode: AdminClaimsReadMode): void;
  release(): void;
  counts(): AdminClaimsReadCounts;
  /** Announced result text of the last delivered passthrough read, if any. */
  delivered(): string | null;
  assertNoError(): void;
  restore(): Promise<void>;
};

type Gate = { promise: Promise<void>; open: () => void; isOpen: () => boolean };
type Slot = { mode: AdminClaimsReadMode; gate: Gate | null; held: boolean };

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

/**
 * Test-only transport seam for the admin claims list read. It handles GET + RSC:1 requests for the
 * exact claims pathname only, never prefetches, writes or HTML. An explicit arm applies one mode to
 * exactly one eligible read: fetch the actual response, validate its structure, optionally hold it,
 * then fulfil it unchanged (passthrough) or with only the recovery read projected to the localized
 * failure. The slot object owns its settlement; after restore() nothing is counted. Any
 * transformation error aborts that one request (never releases the real response) and stores a
 * payload-free error for assertNoError(). It proves the mounted client recovery over the real
 * transport; it is not a database failure.
 */
export async function installAdminClaimsReadSeam(
  page: Page,
  options: { pathname: string; failureMessage: string }
): Promise<AdminClaimsReadSeam> {
  const counts = {
    eligible: 0,
    prefetchIgnored: 0,
    unarmed: 0,
    held: 0,
    failed: 0,
    passed: 0,
    errors: 0,
  };
  let armed: Slot | null = null;
  let active: Slot | null = null;
  let inflight: Promise<void> = Promise.resolve();
  let closed = false;
  let lastDelivered: string | null = null;
  let storedError: Error | null = null;

  const awaiting = (): boolean => active?.held === true && active.gate?.isOpen() === false;
  // Opens the armed or active gate; an early release can never strand a later hold.
  const release = (): void => {
    (armed ?? active)?.gate?.open();
  };

  const settle = async (route: Route, slot: Slot): Promise<void> => {
    const response = await route.fetch();
    const contentType = response.headers()['content-type'] ?? '';
    if (!response.ok() || !contentType.includes('text/x-component')) {
      invalid('saw a failed or non-RSC response');
    }
    const text = await response.text();
    const projected =
      slot.mode.kind === 'failure' ? failAdminClaimsRead(text, options.failureMessage) : undefined;
    const announcement = projected === undefined ? readAdminClaimsResult(text) : null;
    if (slot.gate) {
      slot.held = true;
      if (!closed) counts.held += 1;
      await slot.gate.promise;
    }
    if (projected === undefined) {
      await route.fulfill({ response });
      if (!closed) {
        counts.passed += 1;
        lastDelivered = announcement;
      }
    } else {
      await route.fulfill({ response, body: projected });
      if (!closed) counts.failed += 1;
    }
  };

  const abort = async (route: Route, error: unknown): Promise<void> => {
    counts.errors += 1;
    storedError ??=
      error instanceof AdminClaimsReadSeamError
        ? error
        : new AdminClaimsReadSeamError('S7 admin claims read seam: transport failed');
    await route.abort('failed').catch(() => undefined);
  };

  const handler = async (route: Route): Promise<void> => {
    const request = route.request();
    const kind = classifyRead(request.method(), request.headers());
    if (kind === 'ignore') return route.fallback();
    if (kind === 'prefetch') {
      counts.prefetchIgnored += 1;
      return route.fallback();
    }
    counts.eligible += 1;
    const slot = armed;
    if (!slot) {
      counts.unarmed += 1;
      return route.fallback();
    }
    armed = null;
    active = slot;
    const settling = settle(route, slot).catch(error => abort(route, error));
    inflight = settling;
    try {
      await settling;
    } finally {
      if (active === slot) active = null;
    }
  };

  const matcher = (url: URL): boolean => url.pathname === options.pathname;
  await page.route(matcher, handler);
  return {
    arm(mode) {
      if (armed || active) invalid('is already armed');
      armed = { mode, gate: mode.hold ? createGate() : null, held: false };
    },
    release,
    counts: () => ({ ...counts, awaitingRelease: awaiting() }),
    delivered: () => lastDelivered,
    assertNoError() {
      if (storedError) throw storedError;
    },
    async restore() {
      release();
      armed = null;
      await page.unroute(matcher, handler);
      await inflight;
      closed = true;
    },
  };
}
