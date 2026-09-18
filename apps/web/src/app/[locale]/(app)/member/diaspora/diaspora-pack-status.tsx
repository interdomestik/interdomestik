import type { CountryCode, DiasporaCorridorContext } from '@interdomestik/domain-country-guidance';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';

import {
  canExposeCountryPack,
  HELP_NOW_COUNTRY_PACKS,
  type HelpNowCountryPack,
} from '@/features/help-now/content-packs';

export type DiasporaPackStatus = {
  country: CountryCode;
  disclosure: 'exposed' | 'unavailable';
};

export type DiasporaPackStatusCopy = {
  boundary: string;
  description: string;
  exposed: string;
  title: string;
  unavailable: string;
};

export function deriveDiasporaPackStatus(
  context: DiasporaCorridorContext | null,
  packs: readonly HelpNowCountryPack[] = HELP_NOW_COUNTRY_PACKS
): readonly DiasporaPackStatus[] {
  if (!context) return [];

  const countries = [context.origin, ...context.transit, context.destination];
  const distinctCountries = countries.filter(
    (country, index) => countries.indexOf(country) === index
  );

  return distinctCountries.map(country => ({
    country,
    disclosure:
      packs.filter(pack => pack.country === country).length === 1 &&
      packs.some(pack => pack.country === country && canExposeCountryPack(pack))
        ? 'exposed'
        : 'unavailable',
  }));
}

type Props = {
  countryNames: Readonly<Partial<Record<CountryCode, string>>>;
  context: DiasporaCorridorContext | null;
  copy: DiasporaPackStatusCopy;
};

export function DiasporaPackStatusDisclosure({ countryNames, context, copy }: Readonly<Props>) {
  const statuses = deriveDiasporaPackStatus(context);
  if (statuses.length === 0) return null;
  const countryLabel = (status: DiasporaPackStatus) =>
    countryNames[status.country] ?? status.country;
  const disclosureLabel = (status: DiasporaPackStatus) =>
    status.disclosure === 'exposed' ? copy.exposed : copy.unavailable;

  return (
    <Card
      className="rounded-[2rem] border border-slate-200/80 bg-white dark:border-slate-800/80 dark:bg-slate-950"
      data-testid="diaspora-pack-status"
    >
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>{copy.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="sr-only" role="status">
          {statuses.map(status => `${countryLabel(status)}: ${disclosureLabel(status)}`).join('; ')}
        </p>
        <ul className="grid gap-3 sm:grid-cols-2">
          {statuses.map(status => (
            <li
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-900"
              data-testid={`diaspora-pack-status-${status.country}`}
              key={status.country}
            >
              <span className="font-semibold text-slate-950 dark:text-slate-50">
                {countryLabel(status)}
              </span>
              <Badge variant={status.disclosure === 'exposed' ? 'default' : 'secondary'}>
                {disclosureLabel(status)}
              </Badge>
            </li>
          ))}
        </ul>
        <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.boundary}</p>
      </CardContent>
    </Card>
  );
}
