import type { ComponentProps } from 'react';
import { FLIGHT_JOURNEY_HEADING_ID } from './flight-journey-frame';
import { PublicJourneyQuestion } from './public-journey-question';

type FlightQuestionProps<T extends string> = Omit<
  ComponentProps<typeof PublicJourneyQuestion<T>>,
  'headingId'
>;

export function FlightQuestion<T extends string>(props: FlightQuestionProps<T>) {
  return <PublicJourneyQuestion {...props} headingId={FLIGHT_JOURNEY_HEADING_ID} />;
}
