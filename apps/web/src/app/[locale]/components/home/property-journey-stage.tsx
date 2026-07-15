import { useTranslations } from 'next-intl';
import { PropertyCountryStages } from './property-country-stages';
import { PropertyEvidenceOutcome } from './property-evidence-outcome';
import {
  getPropertyGuidanceKeys,
  getPropertyJourneyOptions,
  type PropertyDamageType,
  type PropertyRole,
  type PropertyStage,
  type PropertyThirdParty,
} from './property-journey-options';
import { PropertyQuestion } from './property-question';
import { PropertySafetyOutcome } from './property-safety-outcome';

type MoveTo = (stage: PropertyStage, focus: boolean, urgent?: boolean) => void;
type PropertyJourneyStageProps = Readonly<{
  damageType: PropertyDamageType;
  moveTo: MoveTo;
  onContinue: () => void;
  propertyCountry: string;
  residenceCountry: string;
  role: PropertyRole;
  setDamageType: (value: PropertyDamageType) => void;
  setPropertyCountry: (country: string) => void;
  setResidenceCountry: (country: string) => void;
  setRole: (value: PropertyRole) => void;
  setThirdParty: (value: PropertyThirdParty) => void;
  stage: PropertyStage;
  thirdParty: PropertyThirdParty;
}>;

export function PropertyJourneyStage(props: PropertyJourneyStageProps) {
  const t = useTranslations('propertyJourney');
  const options = getPropertyJourneyOptions(t);
  const question = (title: string, hint?: string) => ({
    backLabel: t('changeAnswer'),
    hint,
    title,
  });

  if (props.stage === 'danger') {
    return (
      <PropertySafetyOutcome
        backLabel={t('changeAnswer')}
        body={t('danger.body')}
        emergency={t('danger.emergency')}
        onBack={focus => props.moveTo('safety', focus)}
        title={t('danger.title')}
      />
    );
  }

  if (props.stage === 'damage') {
    return (
      <PropertyQuestion
        {...question(t('damage.title'), t('damage.hint'))}
        onBack={focus => props.moveTo('safety', focus)}
        onSelect={(value, focus) => {
          props.setDamageType(value);
          props.moveTo('thirdParty', focus);
        }}
        options={options.damageOptions}
      />
    );
  }

  if (props.stage === 'thirdParty') {
    return (
      <PropertyQuestion
        {...question(t('thirdParty.title'), t('thirdParty.hint'))}
        onBack={focus => props.moveTo('damage', focus)}
        onSelect={(value, focus) => {
          props.setThirdParty(value);
          props.moveTo('role', focus);
        }}
        options={options.thirdPartyOptions}
      />
    );
  }

  if (props.stage === 'role') {
    return (
      <PropertyQuestion
        {...question(t('role.title'))}
        onBack={focus => props.moveTo('thirdParty', focus)}
        onSelect={(value, focus) => {
          props.setRole(value);
          props.moveTo('propertyCountry', focus);
        }}
        options={options.roleOptions}
      />
    );
  }

  if (props.stage === 'propertyCountry' || props.stage === 'residenceCountry') {
    return (
      <PropertyCountryStages
        {...props}
        countryOptions={options.countryOptions}
        stage={props.stage}
      />
    );
  }

  if (props.stage === 'evidence') {
    const guidance = getPropertyGuidanceKeys(props.damageType, props.thirdParty, props.role).map(
      key => t(`evidence.${key}`)
    );
    return (
      <PropertyEvidenceOutcome
        backLabel={t('changeAnswer')}
        body={t('evidence.body')}
        continueLabel={t('evidence.continue')}
        crossBorder={props.propertyCountry !== props.residenceCountry}
        diasporaBody={t('evidence.diasporaBody')}
        diasporaTitle={t('evidence.diasporaTitle')}
        guidance={guidance}
        handoff={t('evidence.handoff')}
        items={['safePhotos', 'inventory', 'receipts'].map(key => t(`evidence.items.${key}`))}
        onBack={focus => props.moveTo('residenceCountry', focus)}
        onContinue={props.onContinue}
        title={t('evidence.title')}
      />
    );
  }

  return (
    <PropertyQuestion
      onSelect={(answer, focus) =>
        props.moveTo(answer === 'no' ? 'damage' : 'danger', focus, answer !== 'no')
      }
      options={options.safetyOptions}
      title={t('title')}
    />
  );
}
