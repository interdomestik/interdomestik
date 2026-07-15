import type { ComponentProps } from 'react';
import { PublicJourneyFrame } from './public-journey-frame';

export const PROPERTY_JOURNEY_HEADING_ID = 'property-journey-heading';

type PropertyJourneyFrameProps = Omit<
  ComponentProps<typeof PublicJourneyFrame>,
  'headingId' | 'testId'
>;

export function PropertyJourneyFrame(props: PropertyJourneyFrameProps) {
  return (
    <PublicJourneyFrame
      {...props}
      headingId={PROPERTY_JOURNEY_HEADING_ID}
      testId="property-safety-journey"
    />
  );
}
