'use client';

import { useEffect, useRef, useState } from 'react';

export type LoginHandoffSubmission = {
  handoffStarted: boolean;
  cleanupCancellation?: () => void;
};
type ObservedNavigation = Event & {
  destination: { url: string; sameDocument: boolean };
  signal: AbortSignal;
};

function observeCancellation(target: string, cancelled: () => void): () => void {
  const navigation = (window as Window & { navigation?: EventTarget }).navigation;
  if (!navigation?.addEventListener || !navigation.removeEventListener) return () => {};
  const originatingDocument = document;
  const originatingURL = globalThis.location.href;
  const destination = new URL(target, originatingURL).href;
  let signal: AbortSignal | undefined;
  let observed = false;
  let disposed = false;
  function dispose() {
    disposed = true;
    try {
      navigation?.removeEventListener('navigate', onNavigate);
      navigation?.removeEventListener('navigatesuccess', dispose);
      signal?.removeEventListener('abort', onAbort);
    } catch {
      // Cleanup never changes the established assign/failure behavior.
    }
  }
  function onAbort() {
    const owned = signal;
    // A replacement navigation may dispatch after aborting this one in the same turn.
    queueMicrotask(() => {
      if (
        disposed ||
        !owned?.aborted ||
        !(owned.reason instanceof DOMException) ||
        owned.reason.name !== 'AbortError' ||
        document !== originatingDocument ||
        globalThis.location.href !== originatingURL
      )
        return;
      dispose();
      cancelled();
    });
  }
  function onNavigate(event: Event) {
    const next = event as ObservedNavigation;
    if (
      observed ||
      next.destination?.url !== destination ||
      next.destination.sameDocument !== false ||
      !next.signal?.addEventListener
    ) {
      dispose();
      return;
    }
    observed = true;
    signal = next.signal;
    signal.addEventListener('abort', onAbort, { once: true });
  }
  try {
    navigation.addEventListener('navigate', onNavigate);
    navigation.addEventListener('navigatesuccess', dispose);
  } catch {
    dispose();
  }
  return dispose;
}

export function useLoginHandoff() {
  const [loading, setLoading] = useState(false);
  const activeSubmission = useRef<LoginHandoffSubmission | null>(null);
  useEffect(() => {
    const dispose = () => activeSubmission.current?.cleanupCancellation?.();
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted && activeSubmission.current?.handoffStarted) {
        dispose();
        activeSubmission.current = null;
        setLoading(false);
      }
    }
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener('pagehide', dispose);
    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('pagehide', dispose);
      dispose();
      activeSubmission.current = null;
    };
  }, []);
  function observeHandoff(submission: LoginHandoffSubmission, target: string) {
    try {
      submission.cleanupCancellation = observeCancellation(target, () => {
        if (activeSubmission.current !== submission || !submission.handoffStarted) return;
        activeSubmission.current = null;
        setLoading(false);
      });
    } catch {
      // Unsupported observers retain normal hard navigation and Reload recovery.
    }
  }
  return { loading, setLoading, activeSubmission, observeHandoff };
}
