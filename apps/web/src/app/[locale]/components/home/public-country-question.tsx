import { useRef } from 'react';

export type PublicCountryQuestionProps = Readonly<{
  backLabel: string;
  continueLabel: string;
  controlId: string;
  headingId: string;
  hint: string;
  label: string;
  onBack: (focusHeading: boolean) => void;
  onChange: (country: string, focusHeading: boolean) => void;
  onContinue: (focusHeading: boolean) => void;
  options: readonly Readonly<{ code: string; label: string }>[];
  placeholder: string;
  selectionFocusOnContinue?: boolean;
  title: string;
  value: string;
}>;

export function PublicCountryQuestion(props: PublicCountryQuestionProps) {
  const keyboardSelectionRef = useRef(false);
  const changeCountry = (country: string) => {
    props.onChange(country, keyboardSelectionRef.current);
    if (!props.selectionFocusOnContinue) keyboardSelectionRef.current = false;
  };
  return (
    <div className="space-y-5">
      <h2
        id={props.headingId}
        tabIndex={-1}
        className="font-serif text-[clamp(2rem,7vw,3.75rem)] font-semibold leading-[1.03]"
      >
        {props.title}
      </h2>
      <p className="text-base leading-7 text-[#334D5C]">{props.hint}</p>
      <label className="block text-base font-semibold" htmlFor={props.controlId}>
        {props.label}
      </label>
      <select
        id={props.controlId}
        value={props.value}
        onKeyDown={() => (keyboardSelectionRef.current = true)}
        onPointerDown={() => (keyboardSelectionRef.current = false)}
        onChange={event => changeCountry(event.target.value)}
        className="min-h-12 w-full border border-[#6E8585] bg-white px-4 py-3 text-base text-[#001A33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70] focus-visible:ring-offset-2"
      >
        <option value="">{props.placeholder}</option>
        {props.options.map(option => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-4">
        {props.value ? (
          <button
            type="button"
            onClick={event =>
              props.onContinue(
                event.detail === 0 ||
                  (props.selectionFocusOnContinue === true && keyboardSelectionRef.current)
              )
            }
            className="min-h-11 bg-[#006A70] px-5 py-2 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70] focus-visible:ring-offset-2"
          >
            {props.continueLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={event => props.onBack(event.detail === 0)}
          className="min-h-11 px-1 font-semibold text-[#005F64] underline decoration-[#65A9A5] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70]"
        >
          {props.backLabel}
        </button>
      </div>
    </div>
  );
}
