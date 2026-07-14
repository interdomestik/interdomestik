import { ArrowLeft, ArrowRight, Globe2 } from 'lucide-react';

type AccidentEvidenceOutcomeProps = Readonly<{
  backLabel: string;
  body: string;
  continueLabel: string;
  diasporaBody: string;
  diasporaTitle: string;
  items: readonly string[];
  onBack: (focusHeading: boolean) => void;
  onContinue: () => void;
  title: string;
}>;

export function AccidentEvidenceOutcome({
  backLabel,
  body,
  continueLabel,
  diasporaBody,
  diasporaTitle,
  items,
  onBack,
  onContinue,
  title,
}: AccidentEvidenceOutcomeProps) {
  return (
    <div className="space-y-6">
      <h2
        id="accident-journey-heading"
        tabIndex={-1}
        className="font-serif text-[clamp(2rem,7vw,3.75rem)] font-semibold leading-[1.03]"
      >
        {title}
      </h2>
      <p className="text-base leading-7 text-[#334D5C]">{body}</p>
      <ul className="space-y-3 border-y border-[#B8C7C7] py-5 text-base leading-7">
        {items.map(item => (
          <li key={item} className="flex gap-3">
            <span aria-hidden="true" className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#008C8C]" />
            {item}
          </li>
        ))}
      </ul>
      <div className="flex gap-3 bg-[#E5F3F0] p-4">
        <Globe2 aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-[#006A70]" />
        <div>
          <h3 className="text-lg font-semibold">{diasporaTitle}</h3>
          <p className="mt-1 text-base leading-7 text-[#334D5C]">{diasporaBody}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={event => onBack(event.detail === 0)}
        className="inline-flex min-h-11 items-center gap-2 px-1 text-base font-semibold text-[#006A70] underline decoration-[#006A70]/50 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70] focus-visible:ring-offset-2"
      >
        <ArrowLeft aria-hidden="true" className="h-5 w-5 shrink-0" />
        {backLabel}
      </button>
      <button
        type="button"
        onClick={onContinue}
        className="group flex min-h-12 w-full items-center justify-between gap-4 bg-[#006A70] px-5 py-3 text-left text-base font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70] focus-visible:ring-offset-2"
      >
        {continueLabel}
        <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0" />
      </button>
    </div>
  );
}
