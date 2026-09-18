'use client';

import { usePathname, useRouter } from '@/i18n/routing';
import {
  MAX_TRANSIT_COUNTRIES,
  parseDiasporaCorridorContext,
  serializeDiasporaCorridorContext,
  type DiasporaCorridorContext,
} from '@interdomestik/domain-country-guidance/corridor';
import { COUNTRY_CODES, type CountryCode } from '@interdomestik/domain-country-guidance/types';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { Plus, Route, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';

export type DiasporaCorridorCopy = Readonly<{
  addTransit: string;
  apply: string;
  chooseCountry: string;
  destination: string;
  origin: string;
  options: Readonly<Record<CountryCode, string>>;
  preparationOnly: string;
  removeTransit: string;
  summaryTitle: string;
  title: string;
  transit: string;
  transitGroup: string;
  transitHint: string;
}>;

type Props = Readonly<{
  copy: DiasporaCorridorCopy;
  initialContext: DiasporaCorridorContext | null;
}>;

function numbered(copy: string, position: number): string {
  return copy.replace('{position}', String(position));
}

function corridorSummary(
  context: DiasporaCorridorContext,
  options: DiasporaCorridorCopy['options']
): string {
  return [context.origin, ...context.transit, context.destination]
    .map(country => options[country])
    .join(' → ');
}

export function DiasporaCorridorCapture({ copy, initialContext }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [origin, setOrigin] = useState(initialContext?.origin ?? '');
  const [destination, setDestination] = useState(initialContext?.destination ?? '');
  const [transit, setTransit] = useState<string[]>(initialContext?.transit ?? []);
  const transitRefs = useRef<Array<HTMLSelectElement | null>>([]);
  const addTransitRef = useRef<HTMLButtonElement | null>(null);
  const focusTransitIndex = useRef<number | null>(null);
  const countries = useMemo(
    () => COUNTRY_CODES.map(code => ({ code, label: copy.options[code] })),
    [copy.options]
  );

  useEffect(() => {
    setOrigin(initialContext?.origin ?? '');
    setDestination(initialContext?.destination ?? '');
    setTransit(initialContext?.transit ?? []);
  }, [initialContext]);

  useEffect(() => {
    const index = focusTransitIndex.current;
    if (index === null) return;
    if (index < 0) addTransitRef.current?.focus();
    else transitRefs.current[index]?.focus();
    focusTransitIndex.current = null;
  }, [transit.length]);

  function addTransit(): void {
    if (transit.length >= MAX_TRANSIT_COUNTRIES) return;
    focusTransitIndex.current = transit.length;
    setTransit(current => [...current, '']);
  }

  function removeTransit(index: number): void {
    focusTransitIndex.current = transit.length === 1 ? -1 : Math.max(0, index - 1);
    setTransit(current => current.filter((_, currentIndex) => currentIndex !== index));
  }

  function updateTransit(index: number, value: string): void {
    setTransit(current =>
      current.map((country, currentIndex) => (currentIndex === index ? value : country))
    );
  }

  function applyCorridor(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const context = parseDiasporaCorridorContext({ origin, destination, transit });
    if (!context) return;

    const nextParams = serializeDiasporaCorridorContext(
      context,
      new URLSearchParams(window.location.search)
    );
    router.replace(`${pathname}?${nextParams.toString()}`);
  }

  return (
    <Card className="rounded-[2rem] border border-slate-200/80 bg-white">
      <CardHeader className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-700">
            <Route aria-hidden="true" className="h-5 w-5" />
          </div>
          <CardTitle>{copy.title}</CardTitle>
        </div>
        <p className="text-sm text-slate-600">{copy.preparationOnly}</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <form className="space-y-4" onSubmit={applyCorridor}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm font-semibold text-slate-900">
              <span>{copy.origin}</span>
              <select
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
                onChange={event => setOrigin(event.target.value)}
                required
                value={origin}
              >
                <option value="">{copy.chooseCountry}</option>
                {countries.map(country => (
                  <option key={country.code} value={country.code}>
                    {country.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-semibold text-slate-900">
              <span>{copy.destination}</span>
              <select
                className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
                onChange={event => setDestination(event.target.value)}
                required
                value={destination}
              >
                <option value="">{copy.chooseCountry}</option>
                {countries.map(country => (
                  <option key={country.code} value={country.code}>
                    {country.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <fieldset className="space-y-3" aria-describedby="diaspora-transit-hint">
            <legend className="text-sm font-semibold text-slate-900">{copy.transitGroup}</legend>
            <p id="diaspora-transit-hint" className="text-sm text-slate-500">
              {copy.transitHint}
            </p>
            {transit.map((countryCode, index) => (
              <div key={index} className="flex items-end gap-2">
                <label className="min-w-0 flex-1 space-y-2 text-sm font-semibold text-slate-900">
                  <span>{numbered(copy.transit, index + 1)}</span>
                  <select
                    className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3"
                    onChange={event => updateTransit(index, event.target.value)}
                    ref={node => {
                      transitRefs.current[index] = node;
                    }}
                    required
                    value={countryCode}
                  >
                    <option value="">{copy.chooseCountry}</option>
                    {countries.map(country => (
                      <option key={country.code} value={country.code}>
                        {country.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button
                  aria-label={numbered(copy.removeTransit, index + 1)}
                  onClick={() => removeTransit(index)}
                  size="icon"
                  type="button"
                  variant="outline"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              disabled={transit.length >= MAX_TRANSIT_COUNTRIES}
              onClick={addTransit}
              ref={addTransitRef}
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" className="mr-2 h-4 w-4" />
              {copy.addTransit}
            </Button>
          </fieldset>

          <Button className="w-full sm:w-auto" type="submit">
            {copy.apply}
          </Button>
        </form>

        {initialContext ? (
          <section
            aria-labelledby="diaspora-corridor-summary-title"
            className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4"
            data-testid="diaspora-corridor-summary"
          >
            <h2 id="diaspora-corridor-summary-title" className="font-semibold text-emerald-950">
              {copy.summaryTitle}
            </h2>
            <p className="mt-2 text-sm text-emerald-950">
              {corridorSummary(initialContext, copy.options)}
            </p>
            <p className="mt-2 text-xs text-emerald-900">{copy.preparationOnly}</p>
          </section>
        ) : null}
      </CardContent>
    </Card>
  );
}
