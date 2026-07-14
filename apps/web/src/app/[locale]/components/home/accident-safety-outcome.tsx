import { ShieldAlert } from 'lucide-react';

type AccidentSafetyOutcomeProps = Readonly<{
  body: string;
  emergency: string;
  onBack: (focusHeading: boolean) => void;
  backLabel: string;
  title: string;
}>;

export function AccidentSafetyOutcome({
  backLabel,
  body,
  emergency,
  onBack,
  title,
}: AccidentSafetyOutcomeProps) {
  return (
    <div className="space-y-5">
      <ShieldAlert aria-hidden="true" className="h-9 w-9 text-[#8A5500]" />
      <h2
        id="accident-journey-heading"
        tabIndex={-1}
        className="font-serif text-[clamp(2rem,7vw,3.75rem)] font-semibold leading-[1.03]"
      >
        {title}
      </h2>
      <p className="text-base leading-7 text-[#334D5C]">{body}</p>
      <p className="border-l-4 border-[#8A5500] bg-[#FFF4D6] px-4 py-3 text-base font-semibold leading-7">
        {emergency}
      </p>
      <button
        type="button"
        onClick={event => onBack(event.detail === 0)}
        className="min-h-11 px-1 font-semibold text-[#005F64] underline decoration-[#65A9A5] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70]"
      >
        {backLabel}
      </button>
    </div>
  );
}
