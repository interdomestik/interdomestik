import { ArrowRight } from 'lucide-react';

type PublicJourneyQuestionProps<T extends string> = Readonly<{
  animateArrow?: boolean;
  backLabel?: string;
  headingId: string;
  hint?: string;
  onBack?: (focusHeading: boolean) => void;
  onSelect: (answer: T, focusHeading: boolean) => void;
  options: readonly Readonly<{ id: T; label: string }>[];
  title: string;
}>;

export function PublicJourneyQuestion<T extends string>(props: PublicJourneyQuestionProps<T>) {
  const arrowClass = props.animateArrow
    ? 'h-5 w-5 text-[#006A70] transition-transform group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none'
    : 'h-5 w-5 shrink-0 text-[#006A70]';
  return (
    <>
      <h2
        id={props.headingId}
        tabIndex={-1}
        className="font-serif text-[clamp(2rem,7vw,3.75rem)] font-semibold leading-[1.03]"
      >
        {props.title}
      </h2>
      {props.hint ? <p className="mt-4 text-base leading-7 text-[#334D5C]">{props.hint}</p> : null}
      <div className="mt-7 border-t border-[#B8C7C7]">
        {props.options.map(option => (
          <button
            key={option.id}
            type="button"
            onClick={event => props.onSelect(option.id, event.detail === 0)}
            className="group grid min-h-16 w-full grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-4 border-b border-[#B8C7C7] py-4 text-left text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#006A70] sm:text-lg"
          >
            <span>{option.label}</span>
            <ArrowRight aria-hidden="true" className={arrowClass} />
          </button>
        ))}
      </div>
      {props.backLabel && props.onBack ? (
        <button
          type="button"
          onClick={event => props.onBack?.(event.detail === 0)}
          className="mt-5 min-h-11 px-1 font-semibold text-[#005F64] underline decoration-[#65A9A5] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70]"
        >
          {props.backLabel}
        </button>
      ) : null}
    </>
  );
}
