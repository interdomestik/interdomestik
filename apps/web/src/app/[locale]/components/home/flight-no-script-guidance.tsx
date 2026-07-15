import { useTranslations } from 'next-intl';

export function FlightNoScriptGuidance() {
  const t = useTranslations('flightJourney');
  return (
    <section id="flight-guidance" className="border-b border-[#B8C7C7] bg-[#F7F5F0] text-[#001A33]">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
        <h2 className="font-serif text-[clamp(2rem,7vw,3.75rem)] font-semibold leading-[1.03]">
          {t('noScript.title')}
        </h2>
        <ul className="mt-6 space-y-3 border-y border-[#B8C7C7] py-5 text-base leading-7">
          {['body', 'baggage', 'emergency'].map(key => (
            <li key={key} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#008C8C]"
              />
              {t(`noScript.${key}`)}
            </li>
          ))}
        </ul>
        <p className="mt-5 text-base leading-7 text-[#334D5C]">{t('noScript.boundary')}</p>
      </div>
    </section>
  );
}
