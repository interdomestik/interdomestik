import { describe, expect, it, vi } from 'vitest';
import {
  failInformationRequestRead,
  type ReadSeamMode,
} from '../../e2e/gate/information-request-read-result.fixture';
import {
  TARGET,
  row,
  props,
  element,
  sample,
} from './information-request-read-result-test-support';
import {
  emptyBody,
  errorOf,
  fakeRoute,
  mount,
  rsc,
  send,
  type FakeResponse,
} from './information-request-read-transport-test-support';

// Transport lifecycle: the real seam driven through a mocked Page/Route, no browser or auth.
const DETAIL = TARGET.pathname;
const FAIL: ReadSeamMode = { kind: 'failure' };
const PASS: ReadSeamMode = { kind: 'passthrough' };
const VERIFIED: ReadSeamMode = { kind: 'passthrough', verifyEmpty: true };
const HELD: ReadSeamMode = { kind: 'passthrough', hold: true };
const TWICE = [0, 1].map(id => row(String(id), element(props({ requests: [] })))).join('\n');

type Exclusion = [name: string, method: string, headers: Record<string, string>, prefetch: number];
const EXCLUDED: Exclusion[] = [
  ['a write', 'POST', { rsc: '1' }, 0],
  ['a plain document read', 'GET', {}, 0],
  ['a non-RSC header', 'GET', { rsc: '0' }, 0],
  ['a router prefetch', 'GET', { rsc: '1', 'next-router-prefetch': '1' }, 1],
  ['a segment prefetch', 'GET', { rsc: '1', 'next-router-segment-prefetch': '/x' }, 1],
];

type Rejected = [name: string, mode: ReadSeamMode, response: FakeResponse, message: string];
const REJECTED: Rejected[] = [
  ['failure wrong target', FAIL, rsc(sample(props({ claimId: 's4-wrong' }))), 'found 0'],
  ['failure ambiguous target', FAIL, rsc(TWICE), 'found 2'],
  ['failure non-RSC', FAIL, rsc(sample(), { contentType: 'text/html' }), 'non-RSC'],
  ['failure non-ok', FAIL, rsc(sample(), { ok: false }), 'non-RSC'],
  ['passthrough non-RSC', PASS, rsc(sample(), { contentType: 'text/html' }), 'non-RSC'],
  ['passthrough non-ok', PASS, rsc(sample(), { ok: false }), 'non-RSC'],
  ['verified wrong target', VERIFIED, rsc(emptyBody({ claimId: 's4-wrong' })), 'found 0'],
  ['verified ambiguous target', VERIFIED, rsc(TWICE), 'found 2'],
  ['verified populated read', VERIFIED, rsc(sample()), 'empty'],
  ['verified failed read', VERIFIED, rsc(sample(props({ requests: null }))), 'empty'],
];

describe('installInformationRequestReadSeam transport lifecycle', () => {
  it('matches only the exact detail pathname and unregisters the same handler', async () => {
    const { seam, page, matcher, handler } = await mount();
    const at = (path: string): boolean => matcher(new URL(path, 'https://app.test'));
    expect([DETAIL, `${DETAIL}?_rsc=abc`].map(at)).toEqual([true, true]);
    const others = [
      `${DETAIL}/`,
      `${DETAIL}/x`,
      '/sq/staff/claims/s4-other',
      '/sq/member/claims/s4-case-a',
    ];
    expect(others.map(at)).toEqual([false, false, false, false]);
    await seam.restore();
    expect(page.unroute).toHaveBeenCalledWith(matcher, handler);
  });

  it.each(EXCLUDED)('ignores %s and keeps the arm', async (_name, method, headers, prefetch) => {
    const { seam, handler } = await mount();
    seam.arm(FAIL);
    const route = fakeRoute(rsc(sample()), { method, headers });
    await send(handler, route);
    expect(route.fallback).toHaveBeenCalledTimes(1);
    expect(route.fetch).not.toHaveBeenCalled();
    expect(route.fulfill).not.toHaveBeenCalled();
    expect(route.abort).not.toHaveBeenCalled();
    expect(seam.counts()).toMatchObject({ eligible: 0, unarmed: 0, prefetchIgnored: prefetch });
    expect(() => seam.arm(FAIL)).toThrow('already armed');
  });

  it('falls back untouched for an eligible read when nothing is armed', async () => {
    const { seam, handler } = await mount();
    const route = fakeRoute(rsc(sample()));
    await send(handler, route);
    expect(route.fallback).toHaveBeenCalledTimes(1);
    expect(route.fetch).not.toHaveBeenCalled();
    expect(seam.counts()).toMatchObject({ eligible: 1, unarmed: 1, failed: 0, passed: 0 });
  });

  it('keeps the initial failure across an actual same-case background read', async () => {
    const { seam, handler } = await mount();
    const initial: ReadSeamMode & { initialFailure: true } = {
      kind: 'failure',
      initialFailure: true,
    };
    seam.arm(initial);
    const navigation = fakeRoute(rsc(emptyBody()));
    const background = fakeRoute(rsc(emptyBody()));
    await send(handler, navigation);
    await send(handler, background);
    expect(background.fetch).toHaveBeenCalledTimes(1);
    expect(background.fallback).not.toHaveBeenCalled();
    expect(background.fulfill.mock.calls[0]?.[0]?.body).toBe(
      failInformationRequestRead(emptyBody(), TARGET)
    );
    expect(errorOf(seam)).toBe('');
    await seam.restore();
  });

  it('fails only the target requests and keeps the rest of the response', async () => {
    const { seam, handler } = await mount();
    seam.arm(FAIL);
    const route = fakeRoute(rsc(sample()));
    await send(handler, route);
    expect(route.fulfill).toHaveBeenCalledTimes(1);
    const options = route.fulfill.mock.calls[0]?.[0];
    expect(options?.response).toBe(route.fetched);
    expect(options?.body).toBe(failInformationRequestRead(sample(), TARGET));
    expect(route.abort).not.toHaveBeenCalled();
    expect(seam.counts()).toMatchObject({ eligible: 1, failed: 1, errors: 0 });
    expect(errorOf(seam)).toBe('');
    expect(() => seam.arm(FAIL)).not.toThrow();
  });

  it.each([
    ['plain', PASS],
    ['verified empty', VERIFIED],
  ])('passes the actual %s response through unmodified', async (_name, mode) => {
    const { seam, handler } = await mount();
    seam.arm(mode);
    const route = fakeRoute(rsc(emptyBody()));
    await send(handler, route);
    expect(route.fulfill).toHaveBeenCalledTimes(1);
    expect(route.fulfill.mock.calls[0]?.[0]).toStrictEqual({ response: route.fetched });
    expect(route.abort).not.toHaveBeenCalled();
    expect(seam.counts()).toMatchObject({ eligible: 1, passed: 1, failed: 0, errors: 0 });
    expect(errorOf(seam)).toBe('');
  });

  it.each(REJECTED)('fails closed on %s', async (_name, mode, response, message) => {
    const { seam, handler } = await mount();
    seam.arm(mode);
    const route = fakeRoute(response);
    await send(handler, route);
    expect(route.abort).toHaveBeenCalledTimes(1);
    expect(route.fulfill).not.toHaveBeenCalled();
    expect(route.fallback).not.toHaveBeenCalled();
    expect(seam.counts()).toMatchObject({ eligible: 1, errors: 1, failed: 0, passed: 0 });
    expect(seam.counts().awaitingRelease).toBe(false);
    expect(errorOf(seam)).toContain(message);
    expect(errorOf(seam)).not.toContain('secret-note');
    expect(() => seam.arm(FAIL)).not.toThrow();
  });

  it('holds one response until release and rejects arming while it is active', async () => {
    const { seam, handler } = await mount();
    seam.arm(HELD);
    const held = fakeRoute(rsc(emptyBody()));
    const pending = send(handler, held);
    await vi.waitFor(() => expect(seam.counts().awaitingRelease).toBe(true));
    expect(held.fulfill).not.toHaveBeenCalled();
    expect(() => seam.arm(FAIL)).toThrow('already armed');
    const duplicate = fakeRoute(rsc(emptyBody()));
    await send(handler, duplicate);
    expect(duplicate.fallback).toHaveBeenCalledTimes(1);
    expect(duplicate.fetch).not.toHaveBeenCalled();
    expect(seam.counts()).toMatchObject({ eligible: 2, held: 1, unarmed: 1, passed: 0 });
    seam.release();
    await pending;
    expect(held.fulfill).toHaveBeenCalledTimes(1);
    expect(seam.counts()).toMatchObject({ passed: 1, awaitingRelease: false });
    expect(() => seam.arm(FAIL)).not.toThrow();
  });

  it('rejects arming from consumption on, even before the fetch returns', async () => {
    const { seam, handler } = await mount();
    seam.arm(PASS);
    const route = fakeRoute(rsc(emptyBody()));
    let respond: () => void = () => undefined;
    route.fetch.mockImplementationOnce(
      () =>
        new Promise<typeof route.fetched>(resolve => {
          respond = () => resolve(route.fetched);
        })
    );
    const pending = send(handler, route);
    expect(() => seam.arm(FAIL)).toThrow('already armed');
    respond();
    await pending;
    expect(route.fulfill).toHaveBeenCalledTimes(1);
    expect(() => seam.arm(FAIL)).not.toThrow();
  });

  it('does not strand a later hold when release comes before the request', async () => {
    const { seam, handler } = await mount();
    seam.arm(HELD);
    seam.release();
    const route = fakeRoute(rsc(emptyBody()));
    await send(handler, route);
    expect(route.fulfill).toHaveBeenCalledTimes(1);
    expect(seam.counts()).toMatchObject({ held: 1, passed: 1, awaitingRelease: false });
  });

  it('restore releases its own held response and unregisters', async () => {
    const { seam, page, handler } = await mount();
    seam.arm(HELD);
    const route = fakeRoute(rsc(emptyBody()));
    const pending = send(handler, route);
    await vi.waitFor(() => expect(seam.counts().awaitingRelease).toBe(true));
    await seam.restore();
    await pending;
    expect(page.unroute).toHaveBeenCalledTimes(1);
    expect(route.fulfill).toHaveBeenCalledTimes(1);
    expect(seam.counts().awaitingRelease).toBe(false);
  });

  it('keeps the first error and never leaks transport details', async () => {
    const { seam, handler } = await mount();
    seam.arm(PASS);
    const transport = fakeRoute(rsc(sample()));
    transport.fetch.mockRejectedValueOnce(new Error('refused https://private.test/secret-note'));
    await send(handler, transport);
    seam.arm(FAIL);
    await send(handler, fakeRoute(rsc(sample(props({ claimId: 's4-wrong' })))));
    expect(transport.abort).toHaveBeenCalledTimes(1);
    expect(seam.counts().errors).toBe(2);
    expect(errorOf(seam)).toContain('transport failed');
    expect(errorOf(seam)).not.toContain('secret-note');
  });
});
