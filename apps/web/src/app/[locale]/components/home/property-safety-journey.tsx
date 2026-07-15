'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PropertyJourneyFrame } from './property-journey-frame';
import {
  type PropertyDamageType,
  type PropertyRole,
  type PropertyStage,
  type PropertyThirdParty,
} from './property-journey-options';
import { PropertyJourneyStage } from './property-journey-stage';
import { useJourneyHeadingFocus } from './use-journey-heading-focus';

type PropertySafetyJourneyProps = Readonly<{ onContinue?: () => void }>;

function resolveLiveMode(focus: boolean, urgent: boolean) {
  if (focus) return 'off';
  return urgent ? 'assertive' : 'polite';
}

export function PropertySafetyJourney({
  onContinue = () => undefined,
}: PropertySafetyJourneyProps) {
  const t = useTranslations('propertyJourney');
  const [stage, setStage] = useState<PropertyStage>('safety');
  const [damageType, setDamageType] = useState<PropertyDamageType>('unsure');
  const [thirdParty, setThirdParty] = useState<PropertyThirdParty>('unsure');
  const [role, setRole] = useState<PropertyRole>('unsure');
  const [propertyCountry, setPropertyCountry] = useState('');
  const [residenceCountry, setResidenceCountry] = useState('');
  const [liveMode, setLiveMode] = useState<'off' | 'polite' | 'assertive'>('polite');
  const { contentRef, requestHeadingFocus } = useJourneyHeadingFocus(stage);
  const moveTo = (next: PropertyStage, focus: boolean, urgent = false) => {
    requestHeadingFocus(focus);
    setLiveMode(resolveLiveMode(focus, urgent));
    setStage(next);
  };

  return (
    <PropertyJourneyFrame
      contentRef={contentRef}
      eyebrow={t('eyebrow')}
      intro={t('intro')}
      liveMode={liveMode}
      privacy={t('privacy')}
    >
      <PropertyJourneyStage
        damageType={damageType}
        moveTo={moveTo}
        onContinue={onContinue}
        propertyCountry={propertyCountry}
        residenceCountry={residenceCountry}
        role={role}
        setDamageType={setDamageType}
        setPropertyCountry={setPropertyCountry}
        setResidenceCountry={setResidenceCountry}
        setRole={setRole}
        setThirdParty={setThirdParty}
        stage={stage}
        thirdParty={thirdParty}
      />
    </PropertyJourneyFrame>
  );
}
