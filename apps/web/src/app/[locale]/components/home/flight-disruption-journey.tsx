'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { FlightJourneyFrame } from './flight-journey-frame';
import {
  type FlightConditionalAnswer,
  type FlightDisruption,
  type FlightStage,
  type FlightTravelState,
} from './flight-journey-options';
import { FlightJourneyStage } from './flight-journey-stage';
import { useJourneyHeadingFocus } from './use-journey-heading-focus';

export function FlightDisruptionJourney() {
  const t = useTranslations('flightJourney');
  const [stage, setStage] = useState<FlightStage>('travelState');
  const [travelState, setTravelState] = useState<FlightTravelState>('unsure');
  const [disruption, setDisruption] = useState<FlightDisruption>('other');
  const [conditional, setConditional] = useState<FlightConditionalAnswer>('unsure');
  const [liveMode, setLiveMode] = useState<'off' | 'polite'>('polite');
  const { contentRef, requestHeadingFocus } = useJourneyHeadingFocus(stage);
  const moveTo = (next: FlightStage, focus: boolean) => {
    requestHeadingFocus(focus);
    setLiveMode(focus ? 'off' : 'polite');
    setStage(next);
  };

  return (
    <FlightJourneyFrame
      contentRef={contentRef}
      eyebrow={t('eyebrow')}
      intro={t('intro')}
      liveMode={liveMode}
      privacy={t('privacy')}
    >
      <FlightJourneyStage
        conditional={conditional}
        disruption={disruption}
        moveTo={moveTo}
        setConditional={setConditional}
        setDisruption={setDisruption}
        setTravelState={setTravelState}
        stage={stage}
        travelState={travelState}
      />
    </FlightJourneyFrame>
  );
}
