import { useTranslations } from 'next-intl';
import { PropertyCountryQuestion } from './property-country-question';
import type { PropertyStage } from './property-journey-options';

type MoveTo = (stage: PropertyStage, focus: boolean, urgent?: boolean) => void;
type PropertyCountryStagesProps = Readonly<{
  countryOptions: readonly Readonly<{ code: string; label: string }>[];
  moveTo: MoveTo;
  propertyCountry: string;
  residenceCountry: string;
  setPropertyCountry: (country: string) => void;
  setResidenceCountry: (country: string) => void;
  stage: 'propertyCountry' | 'residenceCountry';
}>;

export function PropertyCountryStages(props: PropertyCountryStagesProps) {
  const t = useTranslations('propertyJourney');
  const shared = {
    backLabel: t('changeAnswer'),
    continueLabel: t('countries.continue'),
    options: props.countryOptions,
    placeholder: t('countries.placeholder'),
  };

  if (props.stage === 'propertyCountry') {
    return (
      <PropertyCountryQuestion
        {...shared}
        controlId="property-country"
        hint={t('countries.propertyHint')}
        label={t('countries.propertyLabel')}
        onBack={focus => props.moveTo('role', focus)}
        onChange={country => {
          props.setPropertyCountry(country);
          props.setResidenceCountry('');
        }}
        onContinue={focus => props.moveTo('residenceCountry', focus)}
        title={t('countries.propertyTitle')}
        value={props.propertyCountry}
      />
    );
  }

  return (
    <PropertyCountryQuestion
      {...shared}
      controlId="property-residence-country"
      hint={t('countries.residenceHint')}
      label={t('countries.residenceLabel')}
      onBack={focus => props.moveTo('propertyCountry', focus)}
      onChange={props.setResidenceCountry}
      onContinue={focus => props.moveTo('evidence', focus)}
      title={t('countries.residenceTitle')}
      value={props.residenceCountry}
    />
  );
}
