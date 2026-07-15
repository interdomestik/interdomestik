'use client';

import { useEffect, useState } from 'react';
import { AccidentSafetyJourney } from './accident-safety-journey';
import { FlightDisruptionJourney } from './flight-disruption-journey';
import { FlightNoScriptGuidance } from './flight-no-script-guidance';
import { FreeStartIntakeShell as LegacyFreeStartIntakeShell } from './free-start-intake-shell/index';
import type { FreeStartIntakeShellProps } from './free-start-intake-shell/types';
import { InjurySafetyJourney } from './injury-safety-journey';
import { PropertySafetyJourney } from './property-safety-journey';
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
    | 'fallback'
    | 'accident'
    | 'injury'
    | 'property'
    | 'flight'
    | 'vehicleDetails'
    | 'injuryDetails'
    | 'propertyDetails'
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
      if (
        intent === 'vehicle' ||
        intent === 'injury' ||
        intent === 'property' ||
        intent === 'flight'
      ) {
        takePendingPublicEntryIntent();
        setJourneyKey(key => key + 1);
        setMode(intent === 'vehicle' ? 'accident' : intent);
      }
    };
    const onHashChange = () => {
      if (window.location.hash === '#flight-guidance') {
        setMode('flight');
        return;
      }
      if (window.location.hash !== '#free-start-intake') {
        setMode('fallback');
      }
    };

    window.addEventListener(PUBLIC_INTENT_EVENT, onIntent);
    window.addEventListener('hashchange', onHashChange);
    const pendingIntent = takePendingPublicEntryIntent();
    if (
      pendingIntent === 'vehicle' ||
      pendingIntent === 'injury' ||
      pendingIntent === 'property' ||
      pendingIntent === 'flight'
    ) {
      setMode(pendingIntent === 'vehicle' ? 'accident' : pendingIntent);
    } else {
      onHashChange();
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

  if (mode === 'property') {
    return (
      <PropertySafetyJourney
        key={`property-${props.locale}-${journeyKey}`}
        onContinue={() => setMode('propertyDetails')}
      />
    );
  }

  if (mode === 'flight') {
    return <FlightDisruptionJourney key={`flight-${props.locale}-${journeyKey}`} />;
  }

  let initialCategory = props.initialCategory;
  if (mode === 'vehicleDetails') initialCategory = 'vehicle';
  if (mode === 'injuryDetails') initialCategory = 'injury';
  if (mode === 'propertyDetails') initialCategory = 'property';
  return (
    <>
      <noscript>
        <FlightNoScriptGuidance />
      </noscript>
      <LegacyFreeStartIntakeShell
        {...props}
        key={initialCategory ?? 'fallback'}
        initialCategory={initialCategory}
      />
    </>
  );
}
