'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AccidentCountryQuestion } from './accident-country-question';
import { AccidentEvidenceOutcome } from './accident-evidence-outcome';
import { AccidentJourneyFrame } from './accident-journey-frame';
import { type AccidentStage, getAccidentJourneyOptions } from './accident-journey-options';
import { AccidentQuestion } from './accident-question';
import { AccidentSafetyOutcome } from './accident-safety-outcome';
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
  const { countryOptions, injuryOptions, vehicleSafetyOptions } = getAccidentJourneyOptions(t);
  const moveTo = (next: AccidentStage, focus: boolean, urgent = false) => {
    requestHeadingFocus(focus);
    setLiveMode(focus ? 'off' : urgent ? 'assertive' : 'polite');
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
      {stage === 'injured' || stage === 'unsure' || stage === 'unsafeVehicle' ? (
        <AccidentSafetyOutcome
          backLabel={t('changeAnswer')}
          body={t(`${stage}.body`)}
          emergency={t(`${stage}.emergency`)}
          onBack={focus => moveTo(stage === 'unsafeVehicle' ? 'vehicleSafety' : 'injury', focus)}
          title={t(`${stage}.title`)}
        />
      ) : stage === 'vehicleSafety' ? (
        <AccidentQuestion
          backLabel={t('changeAnswer')}
          hint={t('vehicleSafety.hint')}
          onBack={focus => moveTo('injury', focus)}
          onSelect={(answer, focus) => {
            moveTo(answer === 'yes' ? 'incidentCountry' : 'unsafeVehicle', focus, answer !== 'yes');
          }}
          options={vehicleSafetyOptions}
          title={t('vehicleSafety.title')}
        />
      ) : stage === 'incidentCountry' ? (
        <AccidentCountryQuestion
          backLabel={t('changeAnswer')}
          continueLabel={t('countries.continue')}
          hint={t('countries.incidentHint')}
          label={t('countries.incidentLabel')}
          onBack={focus => moveTo('vehicleSafety', focus)}
          onChange={(country, focus) => {
            setIncidentCountry(country);
            setRegistrationCountry('');
            setCounterpartyCountry('');
            if (country) moveTo('registrationCountry', focus);
          }}
          onContinue={focus => moveTo('registrationCountry', focus)}
          options={countryOptions}
          placeholder={t('countries.placeholder')}
          title={t('countries.incidentTitle')}
          value={incidentCountry}
        />
      ) : stage === 'registrationCountry' ? (
        <AccidentCountryQuestion
          backLabel={t('changeAnswer')}
          continueLabel={t('countries.continue')}
          hint={t('countries.registrationHint')}
          label={t('countries.registrationLabel')}
          onBack={focus => moveTo('incidentCountry', focus)}
          onChange={(country, focus) => {
            setRegistrationCountry(country);
            setCounterpartyCountry('');
            if (country) moveTo('counterpartyCountry', focus);
          }}
          onContinue={focus => moveTo('counterpartyCountry', focus)}
          options={countryOptions}
          placeholder={t('countries.placeholder')}
          title={t('countries.registrationTitle')}
          value={registrationCountry}
        />
      ) : stage === 'counterpartyCountry' ? (
        <AccidentCountryQuestion
          backLabel={t('changeAnswer')}
          continueLabel={t('countries.continue')}
          hint={t('countries.counterpartyHint')}
          label={t('countries.counterpartyLabel')}
          onBack={focus => moveTo('registrationCountry', focus)}
          onChange={(country, focus) => {
            setCounterpartyCountry(country);
            if (country) moveTo('evidence', focus);
          }}
          onContinue={focus => moveTo('evidence', focus)}
          options={countryOptions}
          placeholder={t('countries.placeholder')}
          title={t('countries.counterpartyTitle')}
          value={counterpartyCountry}
        />
      ) : stage === 'evidence' ? (
        <AccidentEvidenceOutcome
          backLabel={t('changeAnswer')}
          body={t('evidence.body')}
          continueLabel={t('evidence.continue')}
          diasporaBody={t('evidence.diasporaBody')}
          diasporaTitle={t('evidence.diasporaTitle')}
          items={['scene', 'insurance', 'context', 'reference'].map(item =>
            t(`evidence.items.${item}`)
          )}
          onBack={focus => moveTo('counterpartyCountry', focus)}
          onContinue={onContinue}
          title={t('evidence.title')}
        />
      ) : (
        <AccidentQuestion
          onSelect={(answer, focus) => {
            if (answer === 'yes') moveTo('injured', focus, true);
            if (answer === 'unsure') moveTo('unsure', focus, true);
            if (answer === 'materialOnly') moveTo('vehicleSafety', focus);
          }}
          options={injuryOptions}
          title={t('title')}
        />
      )}
    </AccidentJourneyFrame>
  );
}
