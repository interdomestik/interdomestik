import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendPwaWorkerMessage } from './worker-message';

describe('public pack worker acknowledgments', () => {
  const close = vi.fn();
  let reply: (data: unknown) => void;
  beforeEach(() => {
    vi.useFakeTimers();
    close.mockClear();
    vi.stubGlobal(
      'MessageChannel',
      class {
        port1 = { onmessage: null as ((event: { data: unknown }) => void) | null, close };
        port2 = {};
        constructor() {
          reply = data => this.port1.onmessage?.({ data });
        }
      }
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it.each([true, false])('returns the worker acknowledgment %s and closes its port', async ok => {
    const postMessage = vi.fn();
    const worker = { postMessage } as unknown as ServiceWorker;
    const result = sendPwaWorkerMessage(worker, 'CACHE_HELP_NOW_PACK');
    expect(postMessage).toHaveBeenCalledWith({ type: 'CACHE_HELP_NOW_PACK' }, expect.any(Array));
    reply({ ok });
    await expect(result).resolves.toBe(ok);
    expect(close).toHaveBeenCalledOnce();
  });
  it('reports an unresponsive worker after the public download timeout', async () => {
    const worker = { postMessage: vi.fn() } as unknown as ServiceWorker;
    const result = sendPwaWorkerMessage(worker, 'CACHE_HELP_NOW_PACK');
    await vi.advanceTimersByTimeAsync(15000);
    await expect(result).resolves.toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });
  it('reports a synchronous post failure', async () => {
    const worker = {
      postMessage: () => {
        throw new Error('unavailable');
      },
    } as unknown as ServiceWorker;
    await expect(sendPwaWorkerMessage(worker, 'CACHE_HELP_NOW_PACK')).resolves.toBe(false);
    expect(close).toHaveBeenCalledOnce();
  });
});
