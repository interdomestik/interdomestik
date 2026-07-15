import type { ComponentProps } from 'react';
import { INJURY_JOURNEY_HEADING_ID } from './injury-journey-frame';
import { PublicJourneyQuestion } from './public-journey-question';

type InjuryQuestionProps<T extends string> = Omit<
  ComponentProps<typeof PublicJourneyQuestion<T>>,
  'headingId'
>;

export function InjuryQuestion<T extends string>(props: InjuryQuestionProps<T>) {
  return <PublicJourneyQuestion {...props} headingId={INJURY_JOURNEY_HEADING_ID} />;
}
