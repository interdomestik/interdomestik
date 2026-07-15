import type { ComponentProps } from 'react';
import { PublicJourneyFrame } from './public-journey-frame';

export const ACCIDENT_JOURNEY_HEADING_ID = 'accident-journey-heading';

type AccidentJourneyFrameProps = Omit<
  ComponentProps<typeof PublicJourneyFrame>,
  'headingId' | 'testId'
>;

export function AccidentJourneyFrame(props: AccidentJourneyFrameProps) {
  return (
    <PublicJourneyFrame
      {...props}
      headingId={ACCIDENT_JOURNEY_HEADING_ID}
      testId="accident-safety-journey"
    />
  );
}
