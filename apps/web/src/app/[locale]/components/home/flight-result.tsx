import { ArrowLeft, ExternalLink, Globe2 } from 'lucide-react';
import { FLIGHT_JOURNEY_HEADING_ID } from './flight-journey-frame';

type FlightResultProps = Readonly<{
  backLabel: string;
  boundary: string;
  body: string;
  diasporaBody: string;
  diasporaTitle: string;
  distinctions: string;
  evidenceTitle: string;
  items: readonly string[];
  officialLabel: string;
  onBack: (focusHeading: boolean) => void;
  reform: string;
  title: string;
}>;

export function FlightResult(props: FlightResultProps) {
  return (
    <div className="space-y-6">
      <h2
        id={FLIGHT_JOURNEY_HEADING_ID}
        tabIndex={-1}
        className="font-serif text-[clamp(2rem,7vw,3.75rem)] font-semibold leading-[1.03]"
      >
        {props.title}
      </h2>
      <p className="text-base leading-7 text-[#334D5C]">{props.body}</p>
      <div>
        <h3 className="text-lg font-semibold">{props.evidenceTitle}</h3>
        <ul className="mt-3 space-y-3 border-y border-[#B8C7C7] py-5 text-base leading-7">
          {props.items.map(item => (
            <li key={item} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#008C8C]"
              />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex gap-3 bg-[#E5F3F0] p-4">
        <Globe2 aria-hidden="true" className="mt-0.5 h-6 w-6 shrink-0 text-[#006A70]" />
        <div>
          <h3 className="text-lg font-semibold">{props.diasporaTitle}</h3>
          <p className="mt-1 text-base leading-7 text-[#334D5C]">{props.diasporaBody}</p>
        </div>
      </div>
      <p className="text-base leading-7 text-[#334D5C]">{props.distinctions}</p>
      <p className="border-l-4 border-[#8A5500] bg-[#FFF4D6] px-4 py-3 text-base leading-7">
        {props.reform}
      </p>
      <a
        href="https://europa.eu/youreurope/citizens/travel/passenger-rights/air/index_en.htm"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center gap-2 font-semibold text-[#005F64] underline decoration-[#65A9A5] underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006A70]"
      >
        {props.officialLabel}
        <ExternalLink aria-hidden="true" className="h-5 w-5" />
      </a>
      <p className="border-t border-[#B8C7C7] pt-5 text-base leading-7 text-[#334D5C]">
        {props.boundary}
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
