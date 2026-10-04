import { useEffect, useRef, useState, type RefObject } from 'react';

import { setArrivalScrollMargin } from './arrival-navigation';
import type { CategoryId, StepId } from './types';

type Args = Readonly<{
  blocked: boolean;
  category: CategoryId | null;
  ownership: RefObject<boolean>;
  recoveryOffer?: boolean;
  recoveryBusy?: boolean;
  step: StepId;
}>;

/** A deliberate supported entry owns one arrival. Recovery and subsequent interaction cancel it. */
export function usePublicIntakeArrival({
  blocked,
  category,
  ownership,
  recoveryOffer = false,
  recoveryBusy = false,
  step,
}: Args) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const [request, setRequest] = useState<{
    sequence: number;
    category: CategoryId | null;
    recovery?: true;
    focusAllowed?: false;
  } | null>(null);
  const consumed = useRef(0);
  const generation = useRef(0);
  const current = useRef({ blocked, category, recoveryOffer, recoveryBusy, step });
  current.current = { blocked, category, recoveryOffer, recoveryBusy, step };

  useEffect(() => {
    if (!request || consumed.current === request.sequence) return;
    consumed.current = request.sequence;
    const release = () => {
      if (generation.current === request.sequence) ownership.current = false;
    };
    const canArrive = (context: typeof current.current) =>
      request.recovery
        ? context.recoveryOffer && !context.recoveryBusy
        : !context.blocked && context.step === 'details' && context.category === request.category;
    if (request.focusAllowed === false || !canArrive(current.current)) {
      release();
      return;
    }
    let canceled = false;
    const cancel = () => {
      canceled = true;
      release();
    };
    const events = ['pointerdown', 'keydown', 'input', 'focusin'] as const;
    events.forEach(event => document.addEventListener(event, cancel, true));
    const frame = requestAnimationFrame(() => {
      events.forEach(event => document.removeEventListener(event, cancel, true));
      const latest = current.current;
      const target = request.recovery
        ? document.getElementById('anonymous-draft-recovery-heading')
        : headingRef.current;
      if (!canceled && canArrive(latest) && target?.isConnected && !target.closest('[inert]')) {
        setArrivalScrollMargin(target);
        target.focus({ preventScroll: true });
        // Instant movement also respects reduced motion and cannot outlive a new interaction.
        target.scrollIntoView?.({ block: 'start', behavior: 'instant' });
      }
      release();
    });
    return () => {
      cancelAnimationFrame(frame);
      events.forEach(event => document.removeEventListener(event, cancel, true));
      cancel();
    };
  }, [blocked, category, ownership, recoveryOffer, recoveryBusy, request, step]);

  return {
    headingRef,
    requestDecision: (focusAllowed = true) => {
      if (
        !focusAllowed ||
        !recoveryOffer ||
        recoveryBusy ||
        document.activeElement?.closest('[data-testid="anonymous-draft-recovery-offer"]')
      )
        return;
      ownership.current = false;
      setRequest({ sequence: ++generation.current, category: null, recovery: true });
    },
    request: (nextCategory: CategoryId | null, focusAllowed = true) => {
      if (nextCategory !== 'vehicle' && nextCategory !== 'property') return;
      const active = document.activeElement;
      // Synthetic repeated intents while writing preserve the actual node, caret and focus.
      if (active instanceof HTMLTextAreaElement && active.id === 'free-start-summary') return;
      // Even a relinquished delayed intent owns this transition's generic heading effect,
      // so applying its category cannot steal the customer's newer focus through another path.
      ownership.current = true;
      setRequest({
        sequence: ++generation.current,
        category: nextCategory,
        ...(focusAllowed ? {} : { focusAllowed: false as const }),
      });
    },
  };
}
