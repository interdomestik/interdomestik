'use client';

import { useEffect, useState } from 'react';
import { AccidentSafetyJourney } from './accident-safety-journey';
import { FreeStartIntakeShell as LegacyFreeStartIntakeShell } from './free-start-intake-shell/index';
import type { FreeStartIntakeShellProps } from './free-start-intake-shell/types';
import {
  PUBLIC_INTENT_EVENT,
  readPublicEntryIntent,
  takePendingPublicEntryIntent,
} from './public-entry-intent';

type DynamicFreeStartIntakeShellProps = FreeStartIntakeShellProps &
  Readonly<{ publicEntryEnabled?: boolean }>;

export function FreeStartIntakeShell({
  publicEntryEnabled = true,
  ...props
}: DynamicFreeStartIntakeShellProps) {
  const [mode, setMode] = useState<'fallback' | 'accident' | 'vehicleDetails'>('fallback');

  useEffect(() => {
    if (!publicEntryEnabled) {
      takePendingPublicEntryIntent();
      setMode('fallback');
      return;
    }

    const onIntent = (event: Event) => {
      if (readPublicEntryIntent(event) === 'vehicle') {
        takePendingPublicEntryIntent();
        setMode('accident');
      }
    };
    const onHashChange = () => {
      if (window.location.hash !== '#free-start-intake') {
        setMode('fallback');
      }
    };

    window.addEventListener(PUBLIC_INTENT_EVENT, onIntent);
    window.addEventListener('hashchange', onHashChange);
    if (takePendingPublicEntryIntent() === 'vehicle') {
      setMode('accident');
    }
    return () => {
      window.removeEventListener(PUBLIC_INTENT_EVENT, onIntent);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [publicEntryEnabled]);

  if (mode === 'accident') {
    return <AccidentSafetyJourney onContinue={() => setMode('vehicleDetails')} />;
  }

  return (
    <LegacyFreeStartIntakeShell
      {...props}
      initialCategory={mode === 'vehicleDetails' ? 'vehicle' : props.initialCategory}
    />
  );
}
