import { afterEach, describe, expect, it, vi } from 'vitest';
import { sendPwaWorkerMessage } from '@/lib/pwa/worker-message';
import { saveTripModePackForOffline } from './offline';

vi.mock('@/lib/pwa/worker-message', () => ({ sendPwaWorkerMessage: vi.fn() }));

describe('public Trip Mode download', () => {
  afterEach(() => {
    globalThis.history.pushState(null, '', '/');
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  function browser(controller: unknown): void {
    vi.stubGlobal('navigator', { serviceWorker: { controller } });
    vi.stubGlobal('MessageChannel', class {});
    vi.stubGlobal('caches', { open: vi.fn() });
  }
  it('requires a controlling worker and a public Help Now route', async () => {
    browser(null);
    await expect(saveTripModePackForOffline()).resolves.toBe('unsupported');
    browser({});
    await expect(saveTripModePackForOffline()).resolves.toBe('unsupported');
    expect(sendPwaWorkerMessage).not.toHaveBeenCalled();
  });
  it('delegates all writes to the worker and reports saved only after its acknowledgment', async () => {
    const worker = {};
    browser(worker);
    history.pushState(null, '', '/de/help-now');
    vi.mocked(sendPwaWorkerMessage).mockResolvedValue(true);
    await expect(saveTripModePackForOffline()).resolves.toBe('saved');
    expect(sendPwaWorkerMessage).toHaveBeenCalledWith(worker, 'CACHE_HELP_NOW_PACK');
    expect(caches.open).not.toHaveBeenCalled();
  });
  it.each([false, new Error('worker failure')])('reports worker failure: %s', async result => {
    browser({});
    history.pushState(null, '', '/sq/help-now');
    if (result instanceof Error) vi.mocked(sendPwaWorkerMessage).mockRejectedValue(result);
    else vi.mocked(sendPwaWorkerMessage).mockResolvedValue(result);
    await expect(saveTripModePackForOffline()).resolves.toBe('failed');
  });
});
