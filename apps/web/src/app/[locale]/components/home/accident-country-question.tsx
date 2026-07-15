import { ACCIDENT_JOURNEY_HEADING_ID } from './accident-journey-frame';
import { PublicCountryQuestion, type PublicCountryQuestionProps } from './public-country-question';

type AccidentCountryQuestionProps = Omit<
  PublicCountryQuestionProps,
  'controlId' | 'headingId' | 'selectionFocusOnContinue'
>;

export function AccidentCountryQuestion(props: AccidentCountryQuestionProps) {
  return (
    <PublicCountryQuestion
      {...props}
      controlId="accident-country"
      headingId={ACCIDENT_JOURNEY_HEADING_ID}
    />
  );
}
