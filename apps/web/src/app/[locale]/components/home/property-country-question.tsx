import { PROPERTY_JOURNEY_HEADING_ID } from './property-journey-frame';
import { PublicCountryQuestion, type PublicCountryQuestionProps } from './public-country-question';

type PropertyCountryQuestionProps = Omit<
  PublicCountryQuestionProps,
  'headingId' | 'selectionFocusOnContinue'
>;

export function PropertyCountryQuestion(props: PropertyCountryQuestionProps) {
  return (
    <PublicCountryQuestion
      {...props}
      headingId={PROPERTY_JOURNEY_HEADING_ID}
      selectionFocusOnContinue
    />
  );
}
