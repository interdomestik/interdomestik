import { ArrowRight } from 'lucide-react';

type AccidentQuestionProps<T extends string> = Readonly<{
  backLabel?: string;
  hint?: string;
  onBack?: (focusHeading: boolean) => void;
  onSelect: (answer: T, focusHeading: boolean) => void;
  options: readonly Readonly<{ id: T; label: string }>[];
  title: string;
}>;

export function AccidentQuestion<T extends string>({
  backLabel,
  hint,
  onBack,
  onSelect,
  options,
  title,
}: AccidentQuestionProps<T>) {
  return (
    <>
      <h2
        id="accident-journey-heading"
        tabIndex={-1}
        className="font-serif text-[clamp(2rem,7vw,3.75rem)] font-semibold leading-[1.03]"
      >
        {title}
      </h2>
      {hint ? <p className="mt-4 text-base leading-7 text-[#334D5C]">{hint}</p> : null}
      <div className="mt-7 border-t border-[#B8C7C7]">
        {options.map(option => (
          <button
            key={option.id}
            type="button"
            onClick={event => onSelect(option.id, event.detail === 0)}
            className="group grid min-h-16 w-full grid-cols-[minmax(0,1fr)_1.5rem] items-center gap-4 border-b border-[#B8C7C7] py-4 text-left text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#006A70] sm:text-lg"
          >
            <span>{option.label}</span>
            <ArrowRight
              aria-hidden="true"
              className="h-5 w-5 text-[#006A70] transition-transform group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
            />
          </button>
        ))}
      </div>
      {backLabel && onBack ? (
        <button
          type="button"
          onClick={event => onBack(event.detail === 0)}
          className="mt-5 min-h-11 px-1 font-semibold text-[#005F64] underline decoration-[#65A9A5] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70]"
        >
          {backLabel}
        </button>
      ) : null}
    </>
  );
}
