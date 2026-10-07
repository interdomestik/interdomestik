import { describe, expect, it, vi } from 'vitest';
import {
  failInformationRequestRead,
  type ReadSeamMode,
} from '../../e2e/gate/information-request-read-result.fixture';
import { TARGET, props, sample } from './information-request-read-result-test-support';
import {
  deferFetch,
  emptyBody,
  errorOf,
  fakeRoute,
  mount,
  rsc,
  send,
  type FakeRequest,
  type FakeResponse,
} from './information-request-read-transport-test-support';

// Persistent initial failure phase and its interleaving with a later deliberate read.
const INITIAL: ReadSeamMode = { kind: 'failure', initialFailure: true };
const HELD_FAIL: ReadSeamMode = { kind: 'failure', hold: true };
const FAILED = failInformationRequestRead(emptyBody(), TARGET);
const PREFETCH: FakeRequest = {
  method: 'GET',
  headers: { rsc: '1', 'next-router-prefetch': '1' },
};
const INVALID: [string, ReadSeamMode][] = [
  ['passthrough', { kind: 'passthrough', initialFailure: true }],
  ['held', { kind: 'failure', hold: true, initialFailure: true }],
  ['verified', { kind: 'failure', verifyEmpty: true, initialFailure: true }],
];

type Broken = [name: string, response: FakeResponse, message: string, transport?: boolean];
const BROKEN: Broken[] = [
  ['a missing target', rsc(sample(props({ claimId: 's4-wrong' }))), 'found 0'],
  ['a nested ambiguous target', rsc(sample(props({ children: props() }))), 'found 2'],
  ['an already failed read', rsc(sample(props({ requests: null }))), 'requests list'],
  ['a non-RSC response', rsc(sample(), { contentType: 'text/html' }), 'non-RSC'],
  ['a non-ok response', rsc(sample(), { ok: false }), 'non-RSC'],
  ['a transport error', rsc(sample()), 'transport failed', true],
];

describe('installInformationRequestReadSeam initial failure phase', () => {
  it('fails every initial read and counts navigation apart from background', async () => {
    const { seam, handler } = await mount();
    seam.arm(INITIAL);
    const reads = [0, 1, 2].map(() => fakeRoute(rsc(emptyBody())));
    for (const read of reads) await send(handler, read);
    for (const read of reads) {
      expect(read.fetch).toHaveBeenCalledTimes(1);
      expect(read.fallback).not.toHaveBeenCalled();
      expect(read.fulfill.mock.calls[0]?.[0]).toStrictEqual({
        response: read.fetched,
        body: FAILED,
      });
    }
    expect(seam.counts()).toMatchObject({
      initialNavigation: 1,
      backgroundInitial: 2,
      failed: 3,
      deliberateFailed: 0,
      initialOpen: true,
    });
    expect(() => seam.arm(HELD_FAIL)).toThrow('already armed');
    await seam.finishInitial();
    const later = fakeRoute(rsc(emptyBody()));
    await send(handler, later);
    expect(later.fallback).toHaveBeenCalledTimes(1);
    expect(later.fetch).not.toHaveBeenCalled();
    expect(seam.counts()).toMatchObject({ unarmed: 1, backgroundInitial: 2, initialOpen: false });
    expect(errorOf(seam)).toBe('');
  });

  it('keeps prefetches out of the initial phase', async () => {
    const { seam, handler } = await mount();
    seam.arm(INITIAL);
    const prefetch = fakeRoute(rsc(emptyBody()), PREFETCH);
    await send(handler, prefetch);
    expect(prefetch.fallback).toHaveBeenCalledTimes(1);
    expect(prefetch.fetch).not.toHaveBeenCalled();
    await send(handler, fakeRoute(rsc(emptyBody())));
    expect(seam.counts()).toMatchObject({ prefetchIgnored: 1, eligible: 1, initialNavigation: 1 });
  });

  it.each(INVALID)('rejects a %s initial phase', async (_name, mode) => {
    const { seam } = await mount();
    expect(() => seam.arm(mode)).toThrow('failure-only');
    expect(seam.counts().initialOpen).toBe(false);
    expect(() => seam.arm(INITIAL)).not.toThrow();
  });

  it.each(BROKEN)('fails closed on %s and keeps the error', async (_n, response, message, io) => {
    const { seam, handler } = await mount();
    seam.arm(INITIAL);
    const broken = fakeRoute(response);
    if (io) {
      broken.fetch.mockRejectedValueOnce(new Error('refused https://private.test/secret-note'));
    }
    await send(handler, broken);
    expect(broken.abort).toHaveBeenCalledTimes(1);
    expect(broken.fulfill).not.toHaveBeenCalled();
    expect(broken.fallback).not.toHaveBeenCalled();
    const background = fakeRoute(rsc(emptyBody()));
    await send(handler, background);
    expect(background.fulfill.mock.calls[0]?.[0]?.body).toBe(FAILED);
    expect(seam.counts()).toMatchObject({ errors: 1, initialNavigation: 0, backgroundInitial: 1 });
    expect(errorOf(seam)).toContain(message);
    expect(errorOf(seam)).not.toContain('secret-note');
  });

  it('a late initial settlement cannot consume or clear a newer held retry', async () => {
    const { seam, handler } = await mount();
    seam.arm(INITIAL);
    const late = fakeRoute(rsc(emptyBody()));
    const respondLate = deferFetch(late);
    const latePending = send(handler, late);
    const drained = seam.finishInitial();
    seam.arm(HELD_FAIL);
    const retry = fakeRoute(rsc(emptyBody()));
    const retryPending = send(handler, retry);
    await vi.waitFor(() => expect(seam.counts().awaitingRelease).toBe(true));
    respondLate();
    await Promise.all([latePending, drained]);
    expect(late.fulfill.mock.calls[0]?.[0]?.body).toBe(FAILED);
    expect(retry.fulfill).not.toHaveBeenCalled();
    expect(seam.counts()).toMatchObject({
      initialNavigation: 1,
      initialOutstanding: 0,
      deliberateFailed: 0,
      awaitingRelease: true,
    });
    expect(() => seam.arm(HELD_FAIL)).toThrow('already armed');
    seam.release();
    await retryPending;
    expect(retry.fulfill.mock.calls[0]?.[0]?.body).toBe(FAILED);
    expect(seam.counts()).toMatchObject({ deliberateFailed: 1, failed: 2, awaitingRelease: false });
    expect(errorOf(seam)).toBe('');
  });

  it('drain waits for every initial read that entered before it', async () => {
    const { seam, handler } = await mount();
    seam.arm(INITIAL);
    const first = fakeRoute(rsc(emptyBody()));
    const second = fakeRoute(rsc(emptyBody()));
    const respondFirst = deferFetch(first);
    const respondSecond = deferFetch(second);
    const pending = [send(handler, first), send(handler, second)];
    let drained = false;
    const drain = seam.finishInitial().then(() => {
      drained = true;
    });
    expect(seam.counts()).toMatchObject({ initialOutstanding: 2, initialOpen: false });
    respondFirst();
    await pending[0];
    expect(drained).toBe(false);
    expect(seam.counts().initialOutstanding).toBe(1);
    respondSecond();
    await Promise.all([...pending, drain]);
    expect(drained).toBe(true);
    expect(seam.counts()).toMatchObject({
      initialNavigation: 1,
      backgroundInitial: 1,
      initialOutstanding: 0,
    });
    expect(second.fulfill.mock.calls[0]?.[0]?.body).toBe(FAILED);
  });

  it('restore drains initial reads and releases a held retry past a duplicate', async () => {
    const { seam, page, handler } = await mount();
    seam.arm(INITIAL);
    const late = fakeRoute(rsc(emptyBody()));
    const respondLate = deferFetch(late);
    const latePending = send(handler, late);
    const drained = seam.finishInitial();
    seam.arm(HELD_FAIL);
    const retry = fakeRoute(rsc(emptyBody()));
    const retryPending = send(handler, retry);
    await vi.waitFor(() => expect(seam.counts().awaitingRelease).toBe(true));
    const duplicate = fakeRoute(rsc(emptyBody()));
    await send(handler, duplicate);
    expect(duplicate.fallback).toHaveBeenCalledTimes(1);
    expect(duplicate.fetch).not.toHaveBeenCalled();
    const restored = seam.restore();
    respondLate();
    await Promise.all([restored, latePending, retryPending, drained]);
    expect(page.unroute).toHaveBeenCalledTimes(1);
    expect(late.fulfill).toHaveBeenCalledTimes(1);
    expect(retry.fulfill).toHaveBeenCalledTimes(1);
    expect(seam.counts()).toMatchObject({
      unarmed: 1,
      initialOutstanding: 0,
      awaitingRelease: false,
    });
  });
});
