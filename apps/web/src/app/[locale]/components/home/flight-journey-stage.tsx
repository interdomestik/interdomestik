import { useTranslations } from 'next-intl';
import {
  getConditionalKey,
  getConditionalStage,
  getFlightJourneyOptions,
  type FlightConditionalAnswer,
  type FlightDisruption,
  type FlightStage,
  type FlightTravelState,
} from './flight-journey-options';
import { FlightPriorityNote } from './flight-priority-note';
import { FlightQuestion } from './flight-question';
import { FlightResult } from './flight-result';

type MoveTo = (stage: FlightStage, focus: boolean) => void;
type FlightJourneyStageProps = Readonly<{
  conditional: FlightConditionalAnswer;
  disruption: FlightDisruption;
  moveTo: MoveTo;
  setConditional: (value: FlightConditionalAnswer) => void;
  setDisruption: (value: FlightDisruption) => void;
  setTravelState: (value: FlightTravelState) => void;
  stage: FlightStage;
  travelState: FlightTravelState;
}>;

export function FlightJourneyStage(props: FlightJourneyStageProps) {
  const t = useTranslations('flightJourney');
  const options = getFlightJourneyOptions(t);
  const question = (title: string, back: FlightStage, hint?: string) => ({
    backLabel: t('changeAnswer'),
    hint,
    onBack: (focus: boolean) => props.moveTo(back, focus),
    title,
  });

  if (props.stage === 'result') {
    const conditionalKey = getConditionalKey(props.disruption, props.conditional);
    const items = ['booking', 'messages', 'choices', 'receipts'].map(key =>
      t(`result.evidence.${key}`)
    );
    items.push(t(`result.type.${props.disruption}`));
    if (conditionalKey) items.push(t(`result.conditional.${conditionalKey}`));
    return (
      <FlightResult
        backLabel={t('changeAnswer')}
        boundary={t('result.boundary')}
        body={t(props.travelState === 'no' ? 'result.complete' : 'result.current')}
        diasporaBody={t('result.diasporaBody')}
        diasporaTitle={t('result.diasporaTitle')}
        distinctions={t('result.distinctions')}
        evidenceTitle={t('result.evidenceTitle')}
        items={items}
        officialLabel={t('result.official')}
        onBack={focus => props.moveTo('disruption', focus)}
        reform={t('result.reform')}
        title={t('result.title')}
      />
    );
  }

  const conditionalStage = props.stage === 'connection' || props.stage === 'baggage';
  if (conditionalStage || props.stage === 'notice') {
    const titleKey = props.stage === 'connection' ? 'connection' : props.stage;
    return (
      <FlightQuestion
        {...question(t(`${titleKey}.title`), 'disruption')}
        onSelect={(value, focus) => {
          props.setConditional(value);
          props.moveTo('result', focus);
        }}
        options={options.answers}
      />
    );
  }

  if (props.stage === 'disruption') {
    return (
      <>
        {props.travelState !== 'no' ? (
          <FlightPriorityNote
            body={t('priority.body')}
            emergency={t('priority.emergency')}
            expenses={t('priority.expenses')}
            title={t('priority.title')}
          />
        ) : null}
        <FlightQuestion
          {...question(t('disruption.title'), 'travelState', t('disruption.hint'))}
          onSelect={(value, focus) => {
            props.setDisruption(value);
            props.moveTo(getConditionalStage(value), focus);
          }}
          options={options.disruptions}
        />
      </>
    );
  }

  return (
    <FlightQuestion
      onSelect={(value, focus) => {
        props.setTravelState(value);
        props.moveTo('disruption', focus);
      }}
      options={options.answers}
      title={t('title')}
    />
  );
}
