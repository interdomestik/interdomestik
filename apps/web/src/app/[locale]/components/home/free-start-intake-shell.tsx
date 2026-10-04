'use client';

import { useEffect, useState } from 'react';
import { FlightDisruptionJourney } from './flight-disruption-journey';
import { FlightNoScriptGuidance } from './flight-no-script-guidance';
import { FreeStartIntakeShell as FreeStartOrganizer } from './free-start-intake-shell/index';
// prettier-ignore
import type { FreeStartIntakeShellProps, PublicCategoryIntent } from './free-start-intake-shell/types';
import { InjurySafetyJourney } from './injury-safety-journey';
import {
  PUBLIC_INTENT_EVENT,
  readPublicEntryIntent,
  takePendingPublicEntryIntent,
  type PublicEntryIntent,
} from './public-entry-intent';

type DynamicFreeStartIntakeShellProps = FreeStartIntakeShellProps &
  Readonly<{ publicEntryEnabled?: boolean }>;

type IntakeMode = 'fallback' | 'injury' | 'injuryDetails' | 'flight';

/** Vehicle and property reporting opens the facts editor directly, with no question stage. */
function isDirectCategoryIntent(intent: PublicEntryIntent): intent is 'property' | 'vehicle' {
  return intent === 'vehicle' || intent === 'property';
}

export function FreeStartIntakeShell({
  publicEntryEnabled = true,
  ...props
}: DynamicFreeStartIntakeShellProps) {
  const [mode, setMode] = useState<IntakeMode>('fallback');
  const [journeyKey, setJourneyKey] = useState(0);
  const [categoryIntent, setCategoryIntent] = useState<PublicCategoryIntent | null>(null);

  useEffect(() => {
    if (!publicEntryEnabled) {
      takePendingPublicEntryIntent();
      setCategoryIntent(null);
      setMode('fallback');
      return;
    }

    const applyIntent = (intent: PublicEntryIntent) => {
      if (isDirectCategoryIntent(intent)) {
        // Each activation carries its own sequence so the organizer consumes it exactly once.
        setCategoryIntent(current => ({
          category: intent,
          sequence: (current?.sequence ?? 0) + 1,
        }));
        setMode('fallback');
        return;
      }
      setCategoryIntent(null);
      setJourneyKey(key => key + 1);
      setMode(intent);
    };

    const onIntent = (event: Event) => {
      const intent = readPublicEntryIntent(event);
      if (!intent) return;
      takePendingPublicEntryIntent();
      applyIntent(intent);
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
    if (pendingIntent) {
      applyIntent(pendingIntent);
    } else {
      onHashChange();
    }
    return () => {
      window.removeEventListener(PUBLIC_INTENT_EVENT, onIntent);
      window.removeEventListener('hashchange', onHashChange);
    };
  }, [publicEntryEnabled]);

  if (mode === 'injury') {
    return (
      <InjurySafetyJourney
        key={`injury-${props.locale}-${journeyKey}`}
        onContinue={() => setMode('injuryDetails')}
      />
    );
  }

  if (mode === 'flight') {
    return <FlightDisruptionJourney key={`flight-${props.locale}-${journeyKey}`} />;
  }

  return (
    <>
      <noscript>
        <FlightNoScriptGuidance />
      </noscript>
      {/* Public entry enables the intent listener and its presentation only. The organizer
          instance belongs to the settled owner above, so a repeated public selection, an ordinary
          rerender or the first verified save can never discard typed facts. */}
      <FreeStartOrganizer
        {...props}
        categoryIntent={publicEntryEnabled ? categoryIntent : null}
        initialCategory={mode === 'injuryDetails' ? 'injury' : props.initialCategory}
      />
    </>
  );
}
