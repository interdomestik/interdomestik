import { useEffect, useRef } from 'react';

export function useJourneyHeadingFocus(stage: string) {
  const contentRef = useRef<HTMLDivElement>(null);
  const focusRequestedRef = useRef(false);

  useEffect(() => {
    if (!focusRequestedRef.current) return;
    contentRef.current?.querySelector<HTMLHeadingElement>('h2')?.focus();
    focusRequestedRef.current = false;
  }, [stage]);

  return {
    contentRef,
    requestHeadingFocus: (requested: boolean) => {
      focusRequestedRef.current = requested;
    },
  };
}
