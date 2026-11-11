import type { Page, Request, Response, Route } from '@playwright/test';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withContentPayloadCapture } from '../../e2e/gate/content-payload-capture';
vi.mock('@playwright/test', async () => ({ expect: (await import('vitest')).expect }));
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function visitPayload(payload = 'metadata', action = false) {
  const events = new EventEmitter();
  let navigated = false;
  const failure = vi.fn(() => ({ errorText: 'net::ERR_ABORTED' }));
  const request = {
    url: () => 'https://example.test/staff/support-handoffs',
    resourceType: () => (action ? 'fetch' : 'document'),
    method: () => (action ? 'POST' : 'GET'),
    headers: () => (action ? { 'next-action': 'detail' } : {}),
    failure,
  } as unknown as Request;
  const text = vi.fn(async () => {
    // Complete the body after headers and the visit callback.
    for (let tick = 0; tick < 3; tick++) await Promise.resolve();
    if (navigated) throw new Error('Response body is not available after navigation');
    return payload;
  });
  const status = vi.fn(() => 200);
  const response = {
    request: () => request,
    status,
    headers: () => ({ location: '/login' }),
    text,
  } as unknown as Response;
  const goto = vi.fn(() => {
    navigated = true;
    return Promise.resolve();
  });
  const body = vi.fn(() => Promise.resolve(Buffer.from(payload)));
  const fetched = { status, headers: response.headers, body };
  const routed = {
    request: () => request,
    fetch: vi.fn(() => Promise.resolve(fetched)),
    fulfill: vi.fn(() => Promise.resolve()),
    abort: vi.fn(() => {
      events.emit('requestfailed', request);
      return Promise.resolve();
    }),
    fallback: vi.fn(() => Promise.resolve()),
  };
  const route = vi.fn<(pattern: string, handler: (route: Route) => Promise<void>) => Promise<void>>(
    () => Promise.resolve()
  );
  const unroute = vi.fn(() => Promise.resolve());
  const page = Object.assign(events, { goto, route, unroute }) as unknown as Page;
  return {
    ...{ events, request, response, fetched, routed },
    ...{ failure, text, goto, body, route, unroute, status },
    capture: (visit: Parameters<typeof withContentPayloadCapture>[2], matches = true) =>
      withContentPayloadCapture(page, { matches: () => matches, sentinels: ['PRIVATE'] }, visit),
    intercept: () => {
      events.emit('request', request);
      return route.mock.calls[0][1](routed as unknown as Route);
    },
    receive: (event = 'response') => {
      events.emit('request', request);
      events.emit(event, event === 'response' ? response : request);
    },
  };
}
describe('content payload capture lifecycle', () => {
  afterEach(() => vi.useRealTimers());
  it('drains a forbidden response admitted during awaited unroute', async () => {
    const visit = visitPayload();
    const body = deferred<string>();
    visit.text.mockImplementationOnce(() => body.promise);
    visit.unroute.mockImplementationOnce(async () => {
      visit.receive();
      await Promise.resolve();
      body.resolve('PRIVATE');
    });
    await expect(visit.capture(() => Promise.resolve())).rejects.toMatchObject({
      actual: [expect.stringContaining('forbidden sentinel: PRIVATE')],
    });
    expect(visit.events.eventNames()).toEqual([]);
    expect(visit.goto.mock.invocationCallOrder[0]).toBeLessThan(
      visit.unroute.mock.invocationCallOrder[0]
    );
  });
  it.each(['net::ERR_CONNECTION_RESET', 'net::ERR_ABORTED', 'finished', 'timeout'])(
    'waits for terminal browser event after cleanup fulfill: %s',
    async terminal => {
      vi.useFakeTimers();
      const visit = visitPayload('metadata', true);
      const fetched = deferred<typeof visit.fetched>();
      let handlerSettled = false;
      visit.failure.mockReturnValue({ errorText: terminal });
      visit.routed.fetch.mockImplementationOnce(() => fetched.promise);
      visit.goto.mockImplementationOnce(() => {
        void visit.intercept().then(() => {
          handlerSettled = true;
        });
        return Promise.resolve();
      });
      visit.unroute.mockImplementationOnce(() => Promise.resolve(fetched.resolve(visit.fetched)));
      visit.routed.fulfill.mockImplementationOnce(() => {
        if (terminal !== 'timeout')
          setTimeout(() => {
            expect(handlerSettled).toBe(true);
            visit.events.emit(
              terminal === 'finished' ? 'requestfinished' : 'requestfailed',
              visit.request
            );
          }, 0);
        return Promise.resolve();
      });
      const result = visit.capture(() => Promise.resolve()).catch(error => error.actual);
      await vi.advanceTimersByTimeAsync(9_999);
      expect(visit.events.listenerCount('requestfinished')).toBe(terminal === 'timeout' ? 1 : 0);
      await vi.advanceTimersByTimeAsync(1);
      const error =
        terminal === 'timeout'
          ? 'action request never completed in the browser'
          : 'request failed: net::ERR_CONNECTION_RESET';
      expect(await result).toEqual(
        terminal === 'finished' || terminal === 'net::ERR_ABORTED'
          ? undefined
          : [expect.stringContaining(error)]
      );
      expect(visit.routed.fulfill).toHaveBeenCalledOnce();
      expect(visit.events.eventNames()).toEqual([]);
    }
  );
  it.each([
    ['net::ERR_ABORTED', 'before', true],
    ['net::ERR_ABORTED', 'after', true],
    ['net::ERR_ABORTED', 'before', false],
    ['net::ERR_ABORTED', 'after', false],
    ['net::ERR_CONNECTION_RESET', 'after', true],
  ] as const)('reconciles %s %s fulfill (success=%s)', async (errorText, timing, succeeds) => {
    const visit = visitPayload('metadata', true);
    visit.failure.mockReturnValue({ errorText });
    const fulfillment = deferred<void>();
    const entered = deferred<void>();
    visit.routed.fulfill.mockImplementationOnce(() => {
      entered.resolve();
      return fulfillment.promise;
    });
    const result = visit.capture(async capture => {
      const routed = visit.intercept();
      await entered.promise;
      if (timing === 'before') visit.events.emit('requestfailed', visit.request);
      if (succeeds) fulfillment.resolve();
      else fulfillment.reject(new Error('fulfill failed'));
      await routed;
      if (timing === 'after') visit.events.emit('requestfailed', visit.request);
      if (!succeeds) return;
      const payload = capture.checkedPayload(visit.request);
      expect(capture.checkedPayload(visit.response)).toBe(payload);
      await expect(payload).resolves.toBe('metadata');
      visit.events.emit('response', visit.response);
      await capture.settled();
      expect(capture.checkedPayloadCount).toBe(1);
    });
    if (succeeds && errorText === 'net::ERR_ABORTED') await expect(result).resolves.toBeUndefined();
    else
      await expect(result).rejects.toMatchObject({
        actual: expect.arrayContaining([expect.stringContaining(`request failed: ${errorText}`)]),
      });
    expect(visit.routed.fetch).toHaveBeenCalledExactlyOnceWith({
      maxRedirects: 0,
      maxRetries: 0,
      timeout: 30_000,
    });
    expect(visit.body).toHaveBeenCalledOnce();
    expect(visit.text).not.toHaveBeenCalled();
    if (succeeds) {
      expect(visit.routed.fulfill).toHaveBeenCalledExactlyOnceWith({
        response: visit.fetched,
        body: Buffer.from('metadata'),
      });
      expect(visit.routed.abort).not.toHaveBeenCalled();
      expect(visit.unroute).toHaveBeenCalledWith('**/*', visit.route.mock.calls[0][1]);
    }
  });
  it.each([false, true])('drains original bytes before cleanup (explicit wait=%s)', async wait => {
    const visit = visitPayload();
    await visit.capture(async capture => {
      await visit.intercept();
      visit.events.emit('response', visit.response);
      const payload = capture.checkedPayload(visit.response);
      expect(capture.checkedPayload(visit.response)).toBe(payload);
      expect(capture.checkedPayload(visit.request)).toBe(payload);
      if (!wait) return;
      await expect(payload).resolves.toBe('metadata');
      await capture.settled();
      expect(capture.checkedPayloadCount).toBe(1);
    });
    expect(visit.text).toHaveBeenCalledOnce();
    expect(visit.routed.fallback).toHaveBeenCalledOnce();
    expect(visit.routed.fetch).not.toHaveBeenCalled();
    expect(visit.goto).toHaveBeenCalledWith('about:blank');
    expect(visit.unroute).toHaveBeenCalledWith('**/*', visit.route.mock.calls[0][1]);
    expect(visit.events.eventNames()).toEqual([]);
  });
  it.each([false, true])('rejects and never counts forbidden bytes (action=%s)', async action => {
    const visit = visitPayload('PRIVATE', action);
    await expect(
      visit.capture(async capture => {
        if (action) await visit.intercept();
        else visit.receive();
        await expect(capture.checkedPayload(visit.response)).rejects.toThrow(
          'forbidden sentinel: PRIVATE'
        );
        expect(capture.checkedPayloadCount).toBe(0);
      })
    ).rejects.toThrow('every matching response body was received and checked');
    expect(visit.events.eventNames()).toEqual([]);
    if (!action) return;
    expect(visit.routed.abort).toHaveBeenCalledOnce();
    expect(visit.routed.fulfill).not.toHaveBeenCalled();
    expect(visit.text).not.toHaveBeenCalled();
    expect(visit.unroute).toHaveBeenCalledOnce();
  });
  it.each([false, true])('leaves nonmatches uncaptured and untouched (action=%s)', async action => {
    const visit = visitPayload('PRIVATE', action);
    await visit.capture(async capture => {
      if (action) await visit.intercept();
      else visit.receive();
      visit.events.emit('response', visit.response);
      visit.events.emit('requestfailed', visit.request);
      expect(() => capture.checkedPayload(visit.request)).toThrow('Request was not captured');
      expect(capture.checkedPayloadCount).toBe(0);
      await capture.settled();
    }, false);
    if (action) expect(visit.routed.fallback).toHaveBeenCalledOnce();
    expect(visit.routed.fetch).not.toHaveBeenCalled();
    expect(visit.text).not.toHaveBeenCalled();
  });
  it.each(['fetch', 'body', 'fulfill', 'redirect'] as const)('fails action %s', async stage => {
    const visit = visitPayload('metadata', true);
    const failure = new Error(`${stage} failed`);
    if (stage === 'body') visit.body.mockRejectedValueOnce(failure);
    else if (stage === 'redirect') visit.status.mockReturnValueOnce(303);
    else visit.routed[stage].mockRejectedValueOnce(failure);
    await expect(
      visit.capture(async capture => {
        await visit.intercept();
        await expect(capture.checkedPayload(visit.request)).rejects.toThrow(
          stage === 'redirect' ? 'unexpected redirect 303 -> /login' : `${stage} failed`
        );
      })
    ).rejects.toThrow('every matching response body was received and checked');
    expect(visit.routed.abort).toHaveBeenCalledOnce();
    expect(visit.routed.fetch).toHaveBeenCalledOnce();
    expect(visit.text).not.toHaveBeenCalled();
  });
  it('unroutes after visit failure and preserves the primary error with capture context', async () => {
    const visit = visitPayload('PRIVATE', true);
    await expect(
      visit.capture(async () => {
        await visit.intercept();
        throw new Error('visit failed');
      })
    ).rejects.toThrow('visit failed\nContent payload capture failures:\n');
    expect(visit.unroute).toHaveBeenCalledWith('**/*', visit.route.mock.calls[0][1]);
    expect(visit.events.eventNames()).toEqual([]);
  });
  it.each([false, true])('keeps unfulfilled request failures fatal (action=%s)', async action => {
    const visit = visitPayload('metadata', action);
    await expect(
      visit.capture(() => {
        visit.receive('requestfailed');
        return Promise.resolve();
      })
    ).rejects.toMatchObject({
      actual: expect.arrayContaining([expect.stringContaining('request failed: net::ERR_ABORTED')]),
    });
  });
  it.each([false, true])('fails bypassed actions (service worker=%s)', async serviceWorker => {
    const visit = visitPayload('metadata', true);
    Object.assign(visit.response, { fromServiceWorker: () => serviceWorker });
    await expect(
      visit.capture(() => {
        visit.receive();
        visit.events.emit('requestfinished', visit.request);
        return Promise.resolve();
      })
    ).rejects.toMatchObject({
      actual: [`${visit.request.url()}: action response bypassed interception`],
    });
    expect(visit.text).not.toHaveBeenCalled();
  });
});
