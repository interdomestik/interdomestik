import type { ComponentProps } from 'react';
import { ACCIDENT_JOURNEY_HEADING_ID } from './accident-journey-frame';
import { PublicJourneyQuestion } from './public-journey-question';

type AccidentQuestionProps<T extends string> = Omit<
  ComponentProps<typeof PublicJourneyQuestion<T>>,
  'animateArrow' | 'headingId'
>;

export function AccidentQuestion<T extends string>(props: AccidentQuestionProps<T>) {
  return <PublicJourneyQuestion {...props} animateArrow headingId={ACCIDENT_JOURNEY_HEADING_ID} />;
}
