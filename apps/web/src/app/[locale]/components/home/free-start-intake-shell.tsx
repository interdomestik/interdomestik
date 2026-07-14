'use client';

import { useEffect, useState } from 'react';
import { AccidentSafetyJourney } from './accident-safety-journey';
import { FreeStartIntakeShell as LegacyFreeStartIntakeShell } from './free-start-intake-shell/index';
import type { FreeStartIntakeShellProps } from './free-start-intake-shell/types';
import { InjurySafetyJourney } from './injury-safety-journey';
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
  const [mode, setMode] = useState<
    'fallback' | 'accident' | 'injury' | 'vehicleDetails' | 'injuryDetails'
  >('fallback');
  const [journeyKey, setJourneyKey] = useState(0);

  useEffect(() => {
    if (!publicEntryEnabled) {
      takePendingPublicEntryIntent();
      setMode('fallback');
      return;
    }

    const onIntent = (event: Event) => {
      const intent = readPublicEntryIntent(event);
      if (intent === 'vehicle' || intent === 'injury') {
        takePendingPublicEntryIntent();
        setJourneyKey(key => key + 1);
        setMode(intent === 'vehicle' ? 'accident' : 'injury');
      }
    };
    const onHashChange = () => {
      if (window.location.hash !== '#free-start-intake') {
        setMode('fallback');
      }
    };

    window.addEventListener(PUBLIC_INTENT_EVENT, onIntent);
    window.addEventListener('hashchange', onHashChange);
    const pendingIntent = takePendingPublicEntryIntent();
    if (pendingIntent === 'vehicle' || pendingIntent === 'injury') {
      setMode(pendingIntent === 'vehicle' ? 'accident' : 'injury');
    }
    return () => {
      window.removeEventListener(PUBLIC_INTENT_EVENT, onIntent);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [publicEntryEnabled]);

  if (mode === 'accident') {
    return (
      <AccidentSafetyJourney
        key={`accident-${props.locale}-${journeyKey}`}
        onContinue={() => setMode('vehicleDetails')}
      />
    );
  }

  if (mode === 'injury') {
    return (
      <InjurySafetyJourney
        key={`injury-${props.locale}-${journeyKey}`}
        onContinue={() => setMode('injuryDetails')}
      />
    );
  }

  const initialCategory =
    mode === 'vehicleDetails'
      ? 'vehicle'
      : mode === 'injuryDetails'
        ? 'injury'
        : props.initialCategory;
  return (
    <LegacyFreeStartIntakeShell
      {...props}
      key={initialCategory ?? 'fallback'}
      initialCategory={initialCategory}
    />
  );
}
