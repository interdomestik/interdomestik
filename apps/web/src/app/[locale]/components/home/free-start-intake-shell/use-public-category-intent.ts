'use client';

import { useEffect, useRef } from 'react';

import type { CategoryId, PublicCategoryIntent } from './types';

type Args = Readonly<{
  /**
   * A real recovery decision already owns this sequence: an offer is open, or an explicit
   * resume/discard action the customer started is still running.
   */
  decided: boolean;
  intent?: PublicCategoryIntent | null;
  onEnter: (category: CategoryId, arrivalAllowed: boolean) => void;
  onDecided?: (arrivalAllowed: boolean) => void;
  /** The initial browser-recovery read has settled. */
  resolved: boolean;
}>;

/**
 * Applies at most one deliberate public situation selection per sequence.
 *
 * A cold intent that arrives before the recovery read settles waits for it instead of being lost.
 * A decision-owned intent is consumed before that readiness deferral, so settling the offer or
 * finishing a resume can never replay it over facts the customer deliberately restored.
 */
export function usePublicCategoryIntent({
  decided,
  intent,
  onEnter,
  onDecided,
  resolved,
}: Args): void {
  const appliedSequence = useRef(0);
  const waiting = useRef<{ sequence: number; arrivalAllowed: boolean } | null>(null);
  const enter = useRef(onEnter);
  enter.current = onEnter;
  const decisionArrival = useRef(onDecided);
  decisionArrival.current = onDecided;

  useEffect(() => {
    if (!intent || intent.sequence === appliedSequence.current) return;
    if (waiting.current?.sequence !== intent.sequence) {
      waiting.current = { sequence: intent.sequence, arrivalAllowed: true };
    }
    const ownership = waiting.current;
    if (decided) {
      // Consume without applying: the recovery outcome, not this activation, owns the facts.
      appliedSequence.current = intent.sequence;
      decisionArrival.current?.(ownership.arrivalAllowed);
      return;
    }
    if (resolved) {
      appliedSequence.current = intent.sequence;
      enter.current(intent.category, ownership.arrivalAllowed);
      return;
    }
    // The situation remains requested, but a newer interaction owns focus throughout the read wait.
    const relinquishArrival = () => {
      ownership.arrivalAllowed = false;
    };
    const events = ['pointerdown', 'keydown', 'input', 'focusin'] as const;
    events.forEach(event => document.addEventListener(event, relinquishArrival, true));
    return () => {
      events.forEach(event => document.removeEventListener(event, relinquishArrival, true));
    };
  }, [decided, intent, resolved]);
}
