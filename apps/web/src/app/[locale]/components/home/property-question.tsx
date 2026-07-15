import type { ComponentProps } from 'react';
import { PROPERTY_JOURNEY_HEADING_ID } from './property-journey-frame';
import { PublicJourneyQuestion } from './public-journey-question';

type PropertyQuestionProps<T extends string> = Omit<
  ComponentProps<typeof PublicJourneyQuestion<T>>,
  'headingId'
>;

export function PropertyQuestion<T extends string>(props: PropertyQuestionProps<T>) {
  return <PublicJourneyQuestion {...props} headingId={PROPERTY_JOURNEY_HEADING_ID} />;
}
