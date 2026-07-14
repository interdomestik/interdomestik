import { useTranslations } from 'next-intl';
import { InjuryCountryQuestion } from './injury-country-question';
import { InjuryEvidenceOutcome } from './injury-evidence-outcome';
import { type InjuryStage, getInjuryJourneyOptions } from './injury-journey-options';
import { InjuryQuestion } from './injury-question';
import { InjuryReferralOutcome } from './injury-referral-outcome';
import { InjurySafetyOutcome } from './injury-safety-outcome';

type MoveTo = (stage: InjuryStage, focus: boolean, urgent?: boolean) => void;
type InjuryJourneyStageProps = Readonly<{
  incidentCountry: string;
  moveTo: MoveTo;
  onContinue: () => void;
  residenceCountry: string;
  setIncidentCountry: (country: string) => void;
  setResidenceCountry: (country: string) => void;
  stage: InjuryStage;
}>;

export function InjuryJourneyStage(props: InjuryJourneyStageProps) {
  const t = useTranslations('injuryJourney');
  const { countryOptions, sourceOptions, urgencyOptions } = getInjuryJourneyOptions(t);
  const countryShared = {
    backLabel: t('changeAnswer'),
    continueLabel: t('countries.continue'),
    options: countryOptions,
    placeholder: t('countries.placeholder'),
  };

  if (props.stage === 'urgent') {
    return (
      <InjurySafetyOutcome
        backLabel={t('changeAnswer')}
        body={t('urgent.body')}
        emergency={t('urgent.emergency')}
        onBack={focus => props.moveTo('urgency', focus)}
        title={t('urgent.title')}
      />
    );
  }

  if (props.stage.endsWith('Referral')) {
    const prefix = props.stage.replace('Referral', '');
    return (
      <InjuryReferralOutcome
        backLabel={t('changeAnswer')}
        body={t(`referral.${prefix}Body`)}
        onBack={focus => props.moveTo('source', focus)}
        title={t(`referral.${prefix}Title`)}
      />
    );
  }

  if (props.stage === 'source') {
    return (
      <InjuryQuestion
        backLabel={t('changeAnswer')}
        hint={t('source.hint')}
        onBack={focus => props.moveTo('urgency', focus)}
        onSelect={(source, focus) => {
          if (source === 'treatment') props.moveTo('treatmentReferral', focus);
          else if (source === 'assault') props.moveTo('assaultReferral', focus, true);
          else if (source === 'unsure') props.moveTo('unsureReferral', focus);
          else props.moveTo('incidentCountry', focus);
        }}
        options={sourceOptions}
        title={t('source.title')}
      />
    );
  }

  if (props.stage === 'incidentCountry') {
    return (
      <InjuryCountryQuestion
        {...countryShared}
        controlId="injury-incident-country"
        hint={t('countries.incidentHint')}
        label={t('countries.incidentLabel')}
        onBack={focus => props.moveTo('source', focus)}
        onChange={country => {
          props.setIncidentCountry(country);
          props.setResidenceCountry('');
        }}
        onContinue={focus => props.moveTo('residenceCountry', focus)}
        title={t('countries.incidentTitle')}
        value={props.incidentCountry}
      />
    );
  }

  if (props.stage === 'residenceCountry') {
    return (
      <InjuryCountryQuestion
        {...countryShared}
        controlId="injury-residence-country"
        hint={t('countries.residenceHint')}
        label={t('countries.residenceLabel')}
        onBack={focus => props.moveTo('incidentCountry', focus)}
        onChange={props.setResidenceCountry}
        onContinue={focus => props.moveTo('evidence', focus)}
        title={t('countries.residenceTitle')}
        value={props.residenceCountry}
      />
    );
  }

  if (props.stage === 'evidence') {
    return (
      <InjuryEvidenceOutcome
        backLabel={t('changeAnswer')}
        body={t('evidence.body')}
        continueLabel={t('evidence.continue')}
        diasporaBody={t('evidence.diasporaBody')}
        diasporaTitle={t('evidence.diasporaTitle')}
        handoff={t('evidence.handoff')}
        items={['incident', 'photos', 'costs', 'impact'].map(item => t(`evidence.items.${item}`))}
        onBack={focus => props.moveTo('residenceCountry', focus)}
        onContinue={props.onContinue}
        title={t('evidence.title')}
      />
    );
  }

  return (
    <InjuryQuestion
      onSelect={(answer, focus) =>
        props.moveTo(answer === 'no' ? 'source' : 'urgent', focus, answer !== 'no')
      }
      options={urgencyOptions}
      title={t('title')}
    />
  );
}
