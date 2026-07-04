import { afterEach, describe, expect, it, vi } from 'vitest';
import { HELP_NOW_PACK_ASSET } from './content-packs';
import { saveTripModePackForOffline } from './offline';

function withServiceWorkerController(controller: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'serviceWorker');
  Object.defineProperty(globalThis.navigator, 'serviceWorker', {
    configurable: true,
    value: { controller },
  });
  return () => {
    if (descriptor) Object.defineProperty(globalThis.navigator, 'serviceWorker', descriptor);
    else Reflect.deleteProperty(globalThis.navigator, 'serviceWorker');
  };
}

describe('saveTripModePackForOffline', () => {
  afterEach(() => {
    globalThis.history.pushState(null, '', '/');
    vi.unstubAllGlobals();
  });

  it('does not report saved without a controlling service worker', async () => {
    const open = vi.fn();
    vi.stubGlobal('caches', { open });
    const restore = withServiceWorkerController(null);

    try {
      await expect(saveTripModePackForOffline()).resolves.toBe('unsupported');
      expect(open).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('does not report saved outside the public Help Now route', async () => {
    const open = vi.fn();
    vi.stubGlobal('caches', { open });
    const restore = withServiceWorkerController({});

    try {
      await expect(saveTripModePackForOffline()).resolves.toBe('unsupported');
      expect(open).not.toHaveBeenCalled();
    } finally {
      restore();
    }
  });

  it('saves public Trip Mode assets when the service worker controls the page', async () => {
    const addAll = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue({ addAll }) });
    const restore = withServiceWorkerController({});
    globalThis.history.pushState(null, '', '/en/help-now');

    try {
      await expect(saveTripModePackForOffline()).resolves.toBe('saved');
      expect(addAll).toHaveBeenCalledWith([HELP_NOW_PACK_ASSET, '/en/help-now']);
    } finally {
      restore();
    }
  });

  it('reports failed when the controlled cache write rejects', async () => {
    vi.stubGlobal('caches', {
      open: vi.fn().mockResolvedValue({ addAll: vi.fn().mockRejectedValue(new Error('quota')) }),
    });
    const restore = withServiceWorkerController({});
    globalThis.history.pushState(null, '', '/sq/help-now');

    try {
      await expect(saveTripModePackForOffline()).resolves.toBe('failed');
    } finally {
      restore();
    }
  });
});
