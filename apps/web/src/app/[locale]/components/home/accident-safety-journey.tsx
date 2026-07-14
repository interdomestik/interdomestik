'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AccidentJourneyFrame } from './accident-journey-frame';
import type { AccidentStage } from './accident-journey-options';
import { AccidentJourneyStage } from './accident-journey-stage';
import { useJourneyHeadingFocus } from './use-journey-heading-focus';

type AccidentSafetyJourneyProps = Readonly<{ onContinue?: () => void }>;

export function AccidentSafetyJourney({
  onContinue = () => undefined,
}: AccidentSafetyJourneyProps) {
  const t = useTranslations('accidentJourney');
  const [stage, setStage] = useState<AccidentStage>('injury');
  const [incidentCountry, setIncidentCountry] = useState('');
  const [registrationCountry, setRegistrationCountry] = useState('');
  const [counterpartyCountry, setCounterpartyCountry] = useState('');
  const [liveMode, setLiveMode] = useState<'off' | 'polite' | 'assertive'>('polite');
  const { contentRef, requestHeadingFocus } = useJourneyHeadingFocus(stage);
  const moveTo = (next: AccidentStage, focus: boolean, urgent = false) => {
    requestHeadingFocus(focus);
    if (focus) setLiveMode('off');
    else setLiveMode(urgent ? 'assertive' : 'polite');
    setStage(next);
  };

  return (
    <AccidentJourneyFrame
      contentRef={contentRef}
      eyebrow={t('eyebrow')}
      intro={t('intro')}
      liveMode={liveMode}
      privacy={t('privacy')}
    >
      <AccidentJourneyStage
        counterpartyCountry={counterpartyCountry}
        incidentCountry={incidentCountry}
        moveTo={moveTo}
        onContinue={onContinue}
        registrationCountry={registrationCountry}
        setCounterpartyCountry={setCounterpartyCountry}
        setIncidentCountry={setIncidentCountry}
        setRegistrationCountry={setRegistrationCountry}
        stage={stage}
      />
    </AccidentJourneyFrame>
  );
}
