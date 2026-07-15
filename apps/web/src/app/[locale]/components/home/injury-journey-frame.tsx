import type { ComponentProps } from 'react';
import { PublicJourneyFrame } from './public-journey-frame';

export const INJURY_JOURNEY_HEADING_ID = 'injury-journey-heading';

type InjuryJourneyFrameProps = Omit<
  ComponentProps<typeof PublicJourneyFrame>,
  'headingId' | 'testId'
>;

export function InjuryJourneyFrame(props: InjuryJourneyFrameProps) {
  return (
    <PublicJourneyFrame
      {...props}
      headingId={INJURY_JOURNEY_HEADING_ID}
      testId="injury-safety-journey"
    />
  );
}
