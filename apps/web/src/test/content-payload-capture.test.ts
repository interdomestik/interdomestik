import type { Page, Request, Response } from '@playwright/test';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { withContentPayloadCapture } from '../../e2e/gate/content-payload-capture';

vi.mock('@playwright/test', async () => ({ expect: (await import('vitest')).expect }));

function visitPayload(payload = 'metadata') {
  const events = new EventEmitter();
  let navigated = false;
  const request = {
    url: () => 'https://example.test/staff/support-handoffs',
  } as Request;
  const text = vi.fn(async () => {
    // Model body completion after headers and after the visit callback returns.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    if (navigated) throw new Error('Response body is not available after navigation');
    return payload;
  });
  const response = {
    request: () => request,
    url: request.url,
    status: () => 200,
    text,
  } as unknown as Response;
  const goto = vi.fn(async () => {
    navigated = true;
  });
  const page = Object.assign(events, { goto }) as unknown as Page;
  return {
    page,
    response,
    text,
    goto,
    receive: () => {
      events.emit('request', request);
      events.emit('response', response);
    },
    listenerCount: () => events.eventNames().length,
  };
}

describe('content payload capture lifecycle', () => {
  it('finishes checking a pending body before successful cleanup navigates away', async () => {
    const visit = visitPayload();
    await withContentPayloadCapture(visit.page, { matches: () => true, sentinels: [] }, async () =>
      visit.receive()
    );
    expect(visit.text).toHaveBeenCalledOnce();
    expect(visit.goto).toHaveBeenCalledWith('about:blank');
    expect(visit.listenerCount()).toBe(0);
  });

  it('returns the same checked bytes and reads a response only once', async () => {
    const visit = visitPayload();
    await withContentPayloadCapture(
      visit.page,
      { matches: () => true, sentinels: ['PRIVATE'] },
      async capture => {
        visit.receive();
        const payload = capture.checkedPayload(visit.response);
        expect(capture.checkedPayload(visit.response)).toBe(payload);
        await expect(payload).resolves.toBe('metadata');
        await capture.settled();
        expect(capture.checkedPayloadCount).toBe(1);
      }
    );
    expect(visit.text).toHaveBeenCalledOnce();
  });

  it('never exposes forbidden bytes as a checked payload or counts them as evidence', async () => {
    const visit = visitPayload('PRIVATE');
    await expect(
      withContentPayloadCapture(
        visit.page,
        { matches: () => true, sentinels: ['PRIVATE'] },
        async capture => {
          visit.receive();
          await expect(capture.checkedPayload(visit.response)).rejects.toThrow(
            'forbidden sentinel: PRIVATE'
          );
          expect(capture.checkedPayloadCount).toBe(0);
        }
      )
    ).rejects.toThrow('every matching response body was received and checked');
    expect(visit.listenerCount()).toBe(0);
  });

  it('refuses an uncaptured response instead of replaying or reading it', async () => {
    const visit = visitPayload();
    await withContentPayloadCapture(
      visit.page,
      { matches: () => false, sentinels: [] },
      async capture => {
        visit.receive();
        expect(() => capture.checkedPayload(visit.response)).toThrow('Response was not captured');
        expect(capture.checkedPayloadCount).toBe(0);
      }
    );
    expect(visit.text).not.toHaveBeenCalled();
  });
});
