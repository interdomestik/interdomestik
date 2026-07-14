'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { InjuryJourneyFrame } from './injury-journey-frame';
import type { InjuryStage } from './injury-journey-options';
import { InjuryJourneyStage } from './injury-journey-stage';
import { useJourneyHeadingFocus } from './use-journey-heading-focus';

type InjurySafetyJourneyProps = Readonly<{ onContinue?: () => void }>;

export function InjurySafetyJourney({ onContinue = () => undefined }: InjurySafetyJourneyProps) {
  const t = useTranslations('injuryJourney');
  const [stage, setStage] = useState<InjuryStage>('urgency');
  const [incidentCountry, setIncidentCountry] = useState('');
  const [residenceCountry, setResidenceCountry] = useState('');
  const [liveMode, setLiveMode] = useState<'off' | 'polite' | 'assertive'>('polite');
  const { contentRef, requestHeadingFocus } = useJourneyHeadingFocus(stage);
  const moveTo = (next: InjuryStage, focus: boolean, urgent = false) => {
    let nextLiveMode: 'off' | 'polite' | 'assertive' = 'polite';
    if (focus) nextLiveMode = 'off';
    else if (urgent) nextLiveMode = 'assertive';
    requestHeadingFocus(focus);
    setLiveMode(nextLiveMode);
    setStage(next);
  };

  return (
    <InjuryJourneyFrame
      contentRef={contentRef}
      eyebrow={t('eyebrow')}
      intro={t('intro')}
      liveMode={liveMode}
      privacy={t('privacy')}
    >
      <InjuryJourneyStage
        incidentCountry={incidentCountry}
        moveTo={moveTo}
        onContinue={onContinue}
        residenceCountry={residenceCountry}
        setIncidentCountry={setIncidentCountry}
        setResidenceCountry={setResidenceCountry}
        stage={stage}
      />
    </InjuryJourneyFrame>
  );
}
