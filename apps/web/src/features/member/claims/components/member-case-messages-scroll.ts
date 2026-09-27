'use client';

import { useLayoutEffect, useRef, type UIEvent } from 'react';

/** Keep replies in view only while following the newest messages, or after our own send. */
export function useMemberCaseMessagesScroll(messages: readonly unknown[], sentCount: number) {
  const ref = useRef<HTMLOListElement>(null);
  const following = useRef(true);
  const previousSentCount = useRef(0);

  useLayoutEffect(() => {
    const element = ref.current;
    const justSent = sentCount !== previousSentCount.current;
    previousSentCount.current = sentCount;
    if (element && (following.current || justSent)) {
      // Instant positioning respects reduced motion and never scrolls the surrounding page.
      element.scrollTop = element.scrollHeight;
      following.current = true;
    }
  }, [messages, sentCount]);

  const onScroll = (event: UIEvent<HTMLOListElement>) => {
    const element = event.currentTarget;
    following.current = element.scrollHeight - element.scrollTop - element.clientHeight <= 32;
  };

  return { ref, onScroll };
}
