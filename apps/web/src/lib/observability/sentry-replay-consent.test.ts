import { describe, expect, it, vi } from 'vitest';
import {
  createReplayConsentController,
  initializeConsentReplay,
  stopReplayForNavigation,
} from './sentry-replay-consent';
import { COOKIE_CONSENT_STORAGE_KEY, setCookieConsent } from '@/lib/cookie-consent';
import { waitFor } from '@testing-library/react';

const sdk = vi.hoisted(() => ({
  replay: {
    start: vi.fn(),
    startBuffering: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    flush: vi.fn().mockResolvedValue(undefined),
    getRecordingMode: vi.fn(() => 'buffer'),
    getReplayId: vi.fn(() => 'abcdef0123456789abcdef0123456789'),
  },
  addIntegration: vi.fn(),
  on: vi.fn(),
}));
vi.mock('@sentry/nextjs', () => ({
  replayIntegration: () => sdk.replay,
  addIntegration: sdk.addIntegration,
  getClient: () => ({ on: sdk.on }),
}));

function harness() {
  const replay = {
    start: vi.fn(),
    startBuffering: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  const load = vi.fn().mockResolvedValue(replay);
  const allowed = vi.fn(() => true);
  const sampleSession = vi.fn(() => true);
  const controller = createReplayConsentController({
    load,
    allowed,
    sampleSession,
    errorSampleRate: 0.1,
  });
  return { replay, load, allowed, sampleSession, controller };
}

describe('consent Replay lifecycle', () => {
  it('does not instantiate or buffer for unknown/necessary consent or unsafe routes', async () => {
    const h = harness();
    h.controller.update(false);
    await h.controller.settled();
    expect(h.load).not.toHaveBeenCalled();
    h.allowed.mockReturnValue(false);
    h.controller.update(true);
    await h.controller.settled();
    expect(h.load).not.toHaveBeenCalled();
  });
  it('stops without flushing immediately on revocation and reuses one integration on reaccept', async () => {
    const h = harness();
    h.controller.update(true);
    await h.controller.settled();
    h.controller.update(true);
    await h.controller.settled();
    expect(h.load).toHaveBeenCalledOnce();
    expect(h.replay.start).toHaveBeenCalledOnce();
    h.controller.update(false);
    expect(h.replay.stop).toHaveBeenCalledWith({ flush: false });
    h.controller.update(true);
    await h.controller.settled();
    expect(h.load).toHaveBeenCalledOnce();
    expect(h.replay.start).toHaveBeenCalledTimes(2);
  });
  it('revocation while import resolves cannot start recording or initial buffering', async () => {
    const h = harness();
    let resolve!: (value: typeof h.replay) => void;
    h.load.mockImplementationOnce(
      () =>
        new Promise(r => {
          resolve = r;
        })
    );
    h.controller.update(true);
    await Promise.resolve();
    h.controller.update(false);
    resolve(h.replay);
    await h.controller.settled();
    expect(h.replay.start).not.toHaveBeenCalled();
    expect(h.replay.startBuffering).not.toHaveBeenCalled();
    expect(h.replay.stop).toHaveBeenCalledWith({ flush: false });
  });
  it('waits for a pending stop before reaccepting', async () => {
    const h = harness();
    h.controller.update(true);
    await h.controller.settled();
    let resolve!: () => void;
    h.replay.stop.mockReturnValueOnce(
      new Promise<void>(r => {
        resolve = r;
      })
    );
    h.controller.update(false);
    h.controller.update(true);
    await Promise.resolve();
    expect(h.replay.start).toHaveBeenCalledOnce();
    resolve();
    await h.controller.settled();
    expect(h.replay.start).toHaveBeenCalledTimes(2);
  });
  it('samples ordinary sessions, buffers error candidates only after acceptance and isolates load errors', async () => {
    const h = harness();
    h.sampleSession.mockReturnValue(false);
    h.controller.update(true);
    await h.controller.settled();
    expect(h.replay.startBuffering).toHaveBeenCalledOnce();
    const broken = harness();
    broken.load.mockRejectedValueOnce(Error('SDK import failed'));
    broken.controller.update(true);
    await expect(broken.controller.settled()).resolves.toBeUndefined();
  });
});

describe('existing consent event integration', () => {
  it('listens once, loads only after acceptance, and stops on cross-tab revocation and before navigation', async () => {
    window.history.replaceState(null, '', '/en/login');
    setCookieConsent('necessary');
    initializeConsentReplay(true, 1, 0.1);
    await Promise.resolve();
    expect(sdk.addIntegration).not.toHaveBeenCalled();
    setCookieConsent('accepted');
    await waitFor(() => expect(sdk.replay.start).toHaveBeenCalledOnce());
    initializeConsentReplay(true, 1, 0.1);
    expect(sdk.addIntegration).toHaveBeenCalledOnce();
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, 'necessary');
    window.dispatchEvent(
      new StorageEvent('storage', { key: COOKIE_CONSENT_STORAGE_KEY, newValue: 'necessary' })
    );
    expect(sdk.replay.stop).toHaveBeenCalledWith({ flush: false });
    setCookieConsent('accepted');
    await waitFor(() => expect(sdk.replay.start).toHaveBeenCalledTimes(2));
    const beforeSendEvent = sdk.on.mock.calls.find(call => call[0] === 'beforeSendEvent')?.[1];
    expect(beforeSendEvent).toBeTypeOf('function');
    const afterSendEvent = sdk.on.mock.calls.find(call => call[0] === 'afterSendEvent')?.[1];
    expect(afterSendEvent).toBeTypeOf('function');
    const random = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(array => {
      (array as Uint32Array).fill(0);
      return array;
    });
    const selected: { event_id: string; tags?: Record<string, string> } = {
      event_id: 'selected-error',
    };
    beforeSendEvent(selected);
    expect(selected.tags).toEqual({ replayId: 'abcdef0123456789abcdef0123456789' });
    // Waiting for afterSendEvent lets the SDK attach error_ids before collecting replay context.
    expect(sdk.replay.flush).not.toHaveBeenCalled();
    afterSendEvent(selected, { statusCode: 200 });
    expect(sdk.replay.flush).toHaveBeenCalledWith({ continueRecording: false });
    sdk.replay.flush.mockClear();
    sdk.replay.getReplayId.mockReturnValueOnce('invalid-id');
    const invalid = {};
    beforeSendEvent(invalid);
    expect(invalid).toEqual({});
    afterSendEvent(invalid, { statusCode: 200 });
    expect(sdk.replay.flush).not.toHaveBeenCalled();

    sdk.replay.flush.mockClear();
    stopReplayForNavigation();
    // SDK flush() can restart a stopped integration. An error while the old safe URL
    // remains visible must never flush after the transition has revoked recording.
    beforeSendEvent({});
    afterSendEvent(selected, { statusCode: 200 });
    expect(sdk.replay.flush).not.toHaveBeenCalled();
    random.mockRestore();
    expect(sdk.replay.stop).toHaveBeenCalledTimes(2);
    // Query/hash navigation cannot resume even when accepted consent persists.
    window.history.replaceState(null, '', '/en/login#private');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    await Promise.resolve();
    expect(sdk.replay.start).toHaveBeenCalledTimes(2);
    setCookieConsent('necessary');
    window.history.replaceState(null, '', '/');
  });
});
