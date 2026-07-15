import type { ComponentProps } from 'react';
import { PublicJourneyFrame } from './public-journey-frame';

export const FLIGHT_JOURNEY_HEADING_ID = 'flight-journey-heading';

type FlightJourneyFrameProps = Omit<
  ComponentProps<typeof PublicJourneyFrame>,
  'headingId' | 'testId'
>;

export function FlightJourneyFrame(props: FlightJourneyFrameProps) {
  return (
    <PublicJourneyFrame
      {...props}
      headingId={FLIGHT_JOURNEY_HEADING_ID}
      testId="flight-disruption-journey"
    />
  );
}
