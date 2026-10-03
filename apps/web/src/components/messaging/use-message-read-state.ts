'use client';

import {
  getMessagesForClaim,
  markMessagesAsRead,
  type MessageWithSender,
} from '@/actions/messages';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Stable empty history: a fresh array literal default would retrigger mount effects. */
export const NO_MESSAGES: MessageWithSender[] = [];
export const MESSAGE_POLL_INTERVAL_MS = 30000;

interface UseMessageReadStateOptions {
  readonly claimId: string;
  readonly currentUserId: string;
  readonly fetchOnMount: boolean;
  readonly initialMessages: MessageWithSender[];
  readonly initialReadFailed: boolean;
}

export interface MessageReadState {
  readonly hasLoadedHistory: boolean;
  readonly isFirstLoad: boolean;
  readonly isReading: boolean;
  readonly messages: MessageWithSender[];
  readonly readStatusFailed: boolean;
  readonly refresh: () => Promise<void>;
  readonly retrievalFailed: boolean;
}

export function useMessageReadState({
  claimId,
  currentUserId,
  fetchOnMount,
  initialMessages,
  initialReadFailed,
}: UseMessageReadStateOptions): MessageReadState {
  const [messages, setMessages] = useState<MessageWithSender[]>(initialMessages);
  // Only a read that really succeeded (server-rendered or client) may claim an empty conversation.
  const [hasLoadedHistory, setHasLoadedHistory] = useState(
    initialMessages.length > 0 || (!fetchOnMount && !initialReadFailed)
  );
  const [retrievalFailed, setRetrievalFailed] = useState(!fetchOnMount && initialReadFailed);
  const [readStatusFailed, setReadStatusFailed] = useState(false);
  const [isFirstLoad, setIsFirstLoad] = useState(fetchOnMount && initialMessages.length === 0);
  const [isReading, setIsReading] = useState(false);
  const generationRef = useRef(0);
  const mountedRef = useRef(true);
  // How many retrievals are still outstanding, so the automatic poll can stay out of their way. A
  // count rather than a flag: an explicit refresh may overlap an older read, and the first of them
  // to settle must not hand the poll a conversation that is still loading.
  const pendingReadsRef = useRef(0);

  // A response may only write state, or start read receipts, while it is still the newest read of
  // a mounted panel. Stale generations (out-of-order, changed scope, unmount) are dropped.
  const isCurrent = useCallback(
    (generation: number) => mountedRef.current && generationRef.current === generation,
    []
  );

  // Taking the next generation invalidates everything that is still outstanding. Cleanup takes one
  // too: without that, a restarted effect that issues no new read would leave the previous
  // generation current, so an old read or receipt could count as the newest one all over again.
  const nextGeneration = useCallback(() => {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    return generation;
  }, []);

  const markRead = useCallback(
    async (loaded: MessageWithSender[], generation: number) => {
      // An invalidated generation never starts a receipt in the first place.
      if (!isCurrent(generation)) return;

      const unreadIds = loaded
        .filter(message => message.senderId !== currentUserId && !message.readAt)
        .map(message => message.id);

      if (unreadIds.length === 0) return;

      try {
        const result = await markMessagesAsRead(unreadIds);
        // A started receipt cannot be cancelled, so only its reported status is dropped here.
        if (!isCurrent(generation)) return;
        setReadStatusFailed(result.success !== true);
      } catch {
        if (!isCurrent(generation)) return;
        setReadStatusFailed(true);
      }
    },
    [currentUserId, isCurrent]
  );

  const read = useCallback(async () => {
    const generation = nextGeneration();
    pendingReadsRef.current += 1;
    setIsReading(true);

    let loaded: MessageWithSender[] | null = null;
    try {
      const result = await getMessagesForClaim(claimId);
      loaded = result.success === true && Array.isArray(result.messages) ? result.messages : null;
    } catch {
      loaded = null;
    } finally {
      // Released on every path - rendered, stale, failed, unmounted - and before anything below can
      // return early, so a settled read can never leave the automatic poll switched off.
      pendingReadsRef.current -= 1;
    }

    // Stale reads neither render nor initiate new read receipts.
    if (!isCurrent(generation)) return;

    if (loaded) {
      setMessages(loaded);
      setHasLoadedHistory(true);
      setRetrievalFailed(false);
      setReadStatusFailed(false);
    } else {
      // Retrieval failed: the last successfully loaded history is kept as-is.
      setRetrievalFailed(true);
    }
    setIsFirstLoad(false);
    setIsReading(false);

    if (loaded) await markRead(loaded, generation);
  }, [claimId, isCurrent, markRead, nextGeneration]);

  useEffect(() => {
    mountedRef.current = true;

    if (fetchOnMount) void read();

    const interval = setInterval(() => {
      // The automatic poll never supersedes a retrieval that is still outstanding: taking a new
      // generation every tick would invalidate a read slower than the interval before it could
      // commit, so the first spinner would never clear and the requests would only pile up. The
      // 30s cadence is unchanged and still polls on the next tick once nothing is in flight; an
      // explicit refresh keeps superseding the older read.
      if (pendingReadsRef.current > 0) return;
      void read();
    }, MESSAGE_POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      // Unmount and effect restart both invalidate the active generation before anything new can
      // be started, so no outstanding read or receipt can become current again.
      nextGeneration();
      clearInterval(interval);
    };
  }, [fetchOnMount, nextGeneration, read]);

  // A server re-render of the same conversation is authoritative: it supersedes pending client
  // reads and the status of receipts already on their way. The panel is not remounted, so the
  // typed draft and the optimistic sends are kept; the thread itself may still auto-scroll when
  // the rendered history changes.
  useEffect(() => {
    if (fetchOnMount) return;

    const generation = nextGeneration();
    setIsFirstLoad(false);
    // Whatever client read was in flight no longer speaks for this panel.
    setIsReading(false);

    if (initialReadFailed) {
      // The server read failed: the last successfully loaded history and the draft are kept, and
      // only the generic retrieval error is surfaced. An empty conversation is never claimed here.
      setRetrievalFailed(true);
      return;
    }

    // Server-rendered history needs no extra query; only its receipt is still outstanding.
    setMessages(initialMessages);
    setHasLoadedHistory(true);
    setRetrievalFailed(false);
    setReadStatusFailed(false);
    void markRead(initialMessages, generation);
  }, [fetchOnMount, initialMessages, initialReadFailed, markRead, nextGeneration]);

  return {
    hasLoadedHistory,
    isFirstLoad,
    isReading,
    messages,
    readStatusFailed,
    refresh: read,
    retrievalFailed,
  };
}
