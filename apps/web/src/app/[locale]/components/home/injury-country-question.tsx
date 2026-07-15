import { INJURY_JOURNEY_HEADING_ID } from './injury-journey-frame';
import { PublicCountryQuestion, type PublicCountryQuestionProps } from './public-country-question';

type InjuryCountryQuestionProps = Omit<
  PublicCountryQuestionProps,
  'headingId' | 'selectionFocusOnContinue'
>;

export function InjuryCountryQuestion(props: InjuryCountryQuestionProps) {
  return (
    <PublicCountryQuestion
      {...props}
      headingId={INJURY_JOURNEY_HEADING_ID}
      selectionFocusOnContinue
    />
  );
}
