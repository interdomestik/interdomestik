import { ArrowLeft, Waypoints } from 'lucide-react';
import { INJURY_JOURNEY_HEADING_ID } from './injury-journey-frame';

type InjuryReferralOutcomeProps = Readonly<{
  backLabel: string;
  body: string;
  onBack: (focusHeading: boolean) => void;
  title: string;
}>;

export function InjuryReferralOutcome(props: InjuryReferralOutcomeProps) {
  return (
    <div className="space-y-5">
      <Waypoints aria-hidden="true" className="h-9 w-9 text-[#006A70]" />
      <h2
        id={INJURY_JOURNEY_HEADING_ID}
        tabIndex={-1}
        className="font-serif text-[clamp(2rem,7vw,3.75rem)] font-semibold leading-[1.03]"
      >
        {props.title}
      </h2>
      <p className="border-l-4 border-[#006A70] bg-[#E5F3F0] px-4 py-3 text-base leading-7 text-[#334D5C]">
        {props.body}
      </p>
      <button
        type="button"
        onClick={event => props.onBack(event.detail === 0)}
        className="inline-flex min-h-11 items-center gap-2 px-1 font-semibold text-[#005F64] underline decoration-[#65A9A5] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70]"
      >
        <ArrowLeft aria-hidden="true" className="h-5 w-5" />
        {props.backLabel}
      </button>
    </div>
  );
}
