'use client';

import { useTranslations } from 'next-intl';
import { AccidentCountryQuestion } from './accident-country-question';
import { AccidentEvidenceOutcome } from './accident-evidence-outcome';
import { type AccidentStage, getAccidentJourneyOptions } from './accident-journey-options';
import { AccidentQuestion } from './accident-question';
import { AccidentSafetyOutcome } from './accident-safety-outcome';

type MoveTo = (stage: AccidentStage, focus: boolean, urgent?: boolean) => void;

interface AccidentJourneyStageProps {
  stage: AccidentStage;
  incidentCountry: string;
  registrationCountry: string;
  counterpartyCountry: string;
  moveTo: MoveTo;
  onContinue: () => void;
  setIncidentCountry: (country: string) => void;
  setRegistrationCountry: (country: string) => void;
  setCounterpartyCountry: (country: string) => void;
}

export function AccidentJourneyStage(props: Readonly<AccidentJourneyStageProps>) {
  const t = useTranslations('accidentJourney');
  const { countryOptions, injuryOptions, vehicleSafetyOptions } = getAccidentJourneyOptions(t);
  const countryShared = {
    backLabel: t('changeAnswer'),
    continueLabel: t('countries.continue'),
    options: countryOptions,
    placeholder: t('countries.placeholder'),
  };

  switch (props.stage) {
    case 'injured':
    case 'unsure':
    case 'unsafeVehicle': {
      const backStage = props.stage === 'unsafeVehicle' ? 'vehicleSafety' : 'injury';
      return (
        <AccidentSafetyOutcome
          backLabel={t('changeAnswer')}
          body={t(`${props.stage}.body`)}
          emergency={t(`${props.stage}.emergency`)}
          onBack={focus => props.moveTo(backStage, focus)}
          title={t(`${props.stage}.title`)}
        />
      );
    }
    case 'vehicleSafety':
      return (
        <AccidentQuestion
          backLabel={t('changeAnswer')}
          hint={t('vehicleSafety.hint')}
          onBack={focus => props.moveTo('injury', focus)}
          onSelect={(answer, focus) => {
            const nextStage = answer === 'yes' ? 'incidentCountry' : 'unsafeVehicle';
            props.moveTo(nextStage, focus, answer !== 'yes');
          }}
          options={vehicleSafetyOptions}
          title={t('vehicleSafety.title')}
        />
      );
    case 'incidentCountry':
      return (
        <AccidentCountryQuestion
          {...countryShared}
          hint={t('countries.incidentHint')}
          label={t('countries.incidentLabel')}
          onBack={focus => props.moveTo('vehicleSafety', focus)}
          onChange={(country, focus) => {
            props.setIncidentCountry(country);
            props.setRegistrationCountry('');
            props.setCounterpartyCountry('');
            if (country) props.moveTo('registrationCountry', focus);
          }}
          onContinue={focus => props.moveTo('registrationCountry', focus)}
          title={t('countries.incidentTitle')}
          value={props.incidentCountry}
        />
      );
    case 'registrationCountry':
      return (
        <AccidentCountryQuestion
          {...countryShared}
          hint={t('countries.registrationHint')}
          label={t('countries.registrationLabel')}
          onBack={focus => props.moveTo('incidentCountry', focus)}
          onChange={(country, focus) => {
            props.setRegistrationCountry(country);
            props.setCounterpartyCountry('');
            if (country) props.moveTo('counterpartyCountry', focus);
          }}
          onContinue={focus => props.moveTo('counterpartyCountry', focus)}
          title={t('countries.registrationTitle')}
          value={props.registrationCountry}
        />
      );
    case 'counterpartyCountry':
      return (
        <AccidentCountryQuestion
          {...countryShared}
          hint={t('countries.counterpartyHint')}
          label={t('countries.counterpartyLabel')}
          onBack={focus => props.moveTo('registrationCountry', focus)}
          onChange={(country, focus) => {
            props.setCounterpartyCountry(country);
            if (country) props.moveTo('evidence', focus);
          }}
          onContinue={focus => props.moveTo('evidence', focus)}
          title={t('countries.counterpartyTitle')}
          value={props.counterpartyCountry}
        />
      );
    case 'evidence':
      return (
        <AccidentEvidenceOutcome
          backLabel={t('changeAnswer')}
          body={t('evidence.body')}
          continueLabel={t('evidence.continue')}
          diasporaBody={t('evidence.diasporaBody')}
          diasporaTitle={t('evidence.diasporaTitle')}
          items={['scene', 'insurance', 'context', 'reference'].map(item =>
            t(`evidence.items.${item}`)
          )}
          onBack={focus => props.moveTo('counterpartyCountry', focus)}
          onContinue={props.onContinue}
          title={t('evidence.title')}
        />
      );
    default:
      return (
        <AccidentQuestion
          onSelect={(answer, focus) => {
            if (answer === 'yes') props.moveTo('injured', focus, true);
            if (answer === 'unsure') props.moveTo('unsure', focus, true);
            if (answer === 'materialOnly') props.moveTo('vehicleSafety', focus);
          }}
          options={injuryOptions}
          title={t('title')}
        />
      );
  }
}
