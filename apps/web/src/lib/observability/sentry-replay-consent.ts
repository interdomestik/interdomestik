import { getCookieConsent, subscribeCookieConsent } from '@/lib/cookie-consent';
import { isReplaySafeLocation, replayPrivacyOptions } from './sentry-replay-privacy';
import { sampleReplay } from './sentry-replay-sampling';

type Replay = {
  start(): void;
  startBuffering(): void;
  stop(options: { flush: false }): Promise<void>;
};
type Dependencies = {
  allowed(): boolean;
  load(): Promise<Replay>;
  sampleSession(): boolean;
  errorSampleRate: number;
};

/** Serialized lifecycle prevents imports and pending stops from restarting after revocation. */
export function createReplayConsentController(dependencies: Dependencies) {
  let accepted = false;
  let revision = 0;
  let replay: Replay | undefined;
  let loading: Promise<Replay> | undefined;
  let pending = Promise.resolve();
  let running = false;
  async function stopCurrentReplay(): Promise<void> {
    try {
      if (replay) await replay.stop({ flush: false });
    } catch {
      /* Optional telemetry. */
    }
  }
  function update(nextAccepted: boolean): void {
    accepted = nextAccepted;
    const currentRevision = ++revision;
    // Stop immediately; the SDK marks recording disabled before its promise resolves.
    if (!accepted || !dependencies.allowed()) {
      running = false;
      if (replay) {
        pending = Promise.all([pending, stopCurrentReplay()]).then(
          () => undefined,
          () => undefined
        );
      }
      return;
    }
    pending = pending
      .then(async () => {
        if (currentRevision !== revision || !accepted || !dependencies.allowed() || running) return;
        try {
          loading ??= dependencies.load();
          replay = await loading;
          if (currentRevision !== revision || !accepted || !dependencies.allowed()) {
            await replay.stop({ flush: false });
            return;
          }
          if (dependencies.sampleSession()) replay.start();
          else if (dependencies.errorSampleRate > 0) replay.startBuffering();
          running = true;
        } catch {
          loading = undefined;
        }
      })
      .catch(() => undefined);
  }
  return {
    update,
    settled: () => pending,
    isRecordingAllowed: () => {
      try {
        return accepted && running && dependencies.allowed();
      } catch {
        return false;
      }
    },
  };
}

let activeController: ReturnType<typeof createReplayConsentController> | undefined;
export function initializeConsentReplay(
  enabled: boolean,
  sessionRate: number,
  errorRate: number
): void {
  if (
    !enabled ||
    typeof window === 'undefined' ||
    activeController ||
    (sessionRate === 0 && errorRate === 0)
  )
    return;
  activeController = createReplayConsentController({
    allowed: () => isReplaySafeLocation(window.location.href),
    errorSampleRate: errorRate,
    sampleSession: () => sampleReplay(sessionRate),
    load: async () => {
      const sdk = await import('@sentry/nextjs');
      const replay = sdk.replayIntegration({
        ...replayPrivacyOptions,
        // Selection/flush is handled below, with consent checks at both phases.
        // Suppress SDK automatic buffer flushes, which can outlive navigation.
        beforeErrorSampling: () => false,
      });
      // addIntegration runs setup synchronously. Sampling stays zero during setup.
      sdk.addIntegration(replay);
      const eligible = () =>
        activeController?.isRecordingAllowed() &&
        getCookieConsent() === 'accepted' &&
        isReplaySafeLocation(window.location.href);
      sdk.getClient()?.on('beforeSendEvent', event => {
        try {
          if (
            event.type ||
            !eligible() ||
            replay.getRecordingMode() !== 'buffer' ||
            !sampleReplay(errorRate)
          )
            return;
          const replayId = replay.getReplayId();
          if (replayId && /^[a-f0-9]{32}$/i.test(replayId))
            event.tags = { ...event.tags, replayId };
        } catch {
          /* Optional telemetry. */
        }
      });
      // Flush awaits SDK performance collection; its synchronous error handler records error_ids
      // before the segment context is collected, regardless of listener registration order.
      // Flush only after that successful send, and recheck consent/navigation first.
      sdk.getClient()?.on('afterSendEvent', (event, response) => {
        try {
          if (
            event.type ||
            !eligible() ||
            replay.getRecordingMode() !== 'buffer' ||
            !response.statusCode ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          )
            return;
          const replayId = replay.getReplayId();
          if (!replayId || !/^[a-f0-9]{32}$/i.test(replayId) || event.tags?.replayId !== replayId)
            return;
          void replay.flush({ continueRecording: false }).catch(() => undefined);
        } catch {
          /* Optional telemetry. */
        }
      });
      return replay;
    },
  });
  const refresh = () => activeController?.update(getCookieConsent() === 'accepted');
  subscribeCookieConsent(consent => activeController?.update(consent === 'accepted'));
  window.addEventListener('hashchange', refresh);
  window.addEventListener('popstate', refresh);
  refresh();
}

/** Called before Next starts a route transition, so private pages are never recorded. */
export function stopReplayForNavigation(): void {
  activeController?.update(false);
}
