import { useRef } from 'react';

type CountryOption = Readonly<{ code: string; label: string }>;

type AccidentCountryQuestionProps = Readonly<{
  backLabel: string;
  continueLabel: string;
  hint: string;
  label: string;
  onBack: (focusHeading: boolean) => void;
  onChange: (country: string, focusHeading: boolean) => void;
  onContinue: (focusHeading: boolean) => void;
  options: readonly CountryOption[];
  placeholder: string;
  title: string;
  value: string;
}>;

export function AccidentCountryQuestion({
  backLabel,
  continueLabel,
  hint,
  label,
  onBack,
  onChange,
  onContinue,
  options,
  placeholder,
  title,
  value,
}: AccidentCountryQuestionProps) {
  const keyboardSelectionRef = useRef(false);

  return (
    <div className="space-y-5">
      <h2
        id="accident-journey-heading"
        tabIndex={-1}
        className="font-serif text-[clamp(2rem,7vw,3.75rem)] font-semibold leading-[1.03]"
      >
        {title}
      </h2>
      <p className="text-base leading-7 text-[#334D5C]">{hint}</p>
      <label className="block text-base font-semibold" htmlFor="accident-country">
        {label}
      </label>
      <select
        id="accident-country"
        value={value}
        onKeyDown={() => {
          keyboardSelectionRef.current = true;
        }}
        onPointerDown={() => {
          keyboardSelectionRef.current = false;
        }}
        onChange={event => {
          onChange(event.target.value, keyboardSelectionRef.current);
          keyboardSelectionRef.current = false;
        }}
        className="min-h-12 w-full border border-[#6E8585] bg-white px-4 py-3 text-base text-[#001A33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70] focus-visible:ring-offset-2"
      >
        <option value="">{placeholder}</option>
        {options.map(option => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap items-center gap-4">
        {value ? (
          <button
            type="button"
            onClick={event => onContinue(event.detail === 0)}
            className="min-h-11 bg-[#006A70] px-5 py-2 font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70] focus-visible:ring-offset-2"
          >
            {continueLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={event => onBack(event.detail === 0)}
          className="min-h-11 px-1 font-semibold text-[#005F64] underline decoration-[#65A9A5] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70]"
        >
          {backLabel}
        </button>
      </div>
    </div>
  );
}
