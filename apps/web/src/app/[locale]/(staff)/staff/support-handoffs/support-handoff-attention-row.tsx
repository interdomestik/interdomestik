'use client';

import { useEffect, useState, type ReactNode } from 'react';

export const SUPPORT_HANDOFF_ATTENTION_RESOLVED_EVENT = 'support-handoff-attention-resolved';

type Props = Readonly<{
  children: ReactNode;
  handoffId: string;
  isAttentionQueue: boolean;
}>;

type SupportHandoffAttentionResolvedDetail = Readonly<{
  handoffId?: string;
}>;

function isAttentionResolvedEvent(
  event: Event
): event is CustomEvent<SupportHandoffAttentionResolvedDetail> {
  return event instanceof CustomEvent;
}

export function SupportHandoffAttentionRow({ children, handoffId, isAttentionQueue }: Props) {
  const [isResolved, setIsResolved] = useState(false);

  useEffect(() => {
    if (!isAttentionQueue) return;

    function handleAttentionResolved(event: Event) {
      if (isAttentionResolvedEvent(event) && event.detail.handoffId === handoffId) {
        setIsResolved(true);
      }
    }

    globalThis.addEventListener(SUPPORT_HANDOFF_ATTENTION_RESOLVED_EVENT, handleAttentionResolved);
    return () =>
      globalThis.removeEventListener(
        SUPPORT_HANDOFF_ATTENTION_RESOLVED_EVENT,
        handleAttentionResolved
      );
  }, [handoffId, isAttentionQueue]);

  if (isResolved) return null;

  return (
    <div
      className="grid grid-cols-1 items-start gap-4 px-4 py-4 text-sm md:grid-cols-6"
      data-testid="staff-support-handoffs-row"
    >
      {children}
    </div>
  );
}
