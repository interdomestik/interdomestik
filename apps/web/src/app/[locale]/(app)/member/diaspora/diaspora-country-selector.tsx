import {
  CountryCodeSchema,
  serializeDiasporaCorridorContext,
  type DiasporaCorridorContext,
} from '@interdomestik/domain-country-guidance';
import { Button, Card, CardDescription, CardHeader, CardTitle } from '@interdomestik/ui';
import { Siren } from 'lucide-react';

import { Link } from '@/i18n/routing';

export const QUICKSTART_COUNTRIES = [
  { code: 'DE', labelKey: 'selector.options.DE' },
  { code: 'CH', labelKey: 'selector.options.CH' },
  { code: 'AT', labelKey: 'selector.options.AT' },
  { code: 'IT', labelKey: 'selector.options.IT' },
] as const;

export type SupportedQuickstartCountry = (typeof QUICKSTART_COUNTRIES)[number]['code'];

export function resolveQuickstartCountry(
  rawCountry: string | string[] | undefined
): SupportedQuickstartCountry | null {
  if (typeof rawCountry !== 'string') return null;

  const parsed = CountryCodeSchema.safeParse(rawCountry.toUpperCase());
  if (!parsed.success) return null;

  return QUICKSTART_COUNTRIES.find(country => country.code === parsed.data)?.code ?? null;
}

type CountryOption<Code extends string> = {
  code: Code;
  label: string;
};

type Props<Code extends string> = {
  countries: readonly CountryOption<Code>[];
  corridorContext: DiasporaCorridorContext | null;
  hint: string;
  label: string;
  labelledBy: string;
  selectedCountry: Code | null;
};

export function DiasporaCountrySelector<Code extends string>({
  countries,
  corridorContext,
  hint,
  label,
  labelledBy,
  selectedCountry,
}: Readonly<Props<Code>>) {
  return (
    <div className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-4 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.55)]">
      <div className="mb-3">
        <p id={labelledBy} className="text-sm font-semibold text-slate-900">
          {label}
        </p>
        <p className="text-sm text-slate-500">{hint}</p>
      </div>
      <nav
        aria-labelledby={labelledBy}
        className="flex flex-wrap gap-2"
        data-testid="diaspora-country-selector"
      >
        {countries.map(country => {
          const isSelected = country.code === selectedCountry;
          const params = corridorContext
            ? serializeDiasporaCorridorContext(
                corridorContext,
                new URLSearchParams({ country: country.code })
              )
            : new URLSearchParams({ country: country.code });

          return (
            <Button
              key={country.code}
              asChild
              variant={isSelected ? 'default' : 'outline'}
              className="min-w-24 rounded-full"
            >
              <Link
                aria-current={isSelected ? 'page' : undefined}
                href={`/member/diaspora?${params.toString()}`}
              >
                {country.label}
              </Link>
            </Button>
          );
        })}
      </nav>
    </div>
  );
}

type RequiredCardProps = {
  description: string;
  title: string;
};

export function DiasporaCountryRequiredCard({ description, title }: Readonly<RequiredCardProps>) {
  return (
    <Card
      className="rounded-[2rem] border border-slate-200/80 bg-white"
      data-testid="diaspora-country-required"
    >
      <CardHeader className="space-y-3">
        <div className="w-fit rounded-2xl bg-sky-50 p-3 text-sky-700">
          <Siren className="h-5 w-5" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}
