import { Button, Card, CardDescription, CardHeader, CardTitle } from '@interdomestik/ui';
import { Siren } from 'lucide-react';

import { Link } from '@/i18n/routing';

type CountryOption<Code extends string> = {
  code: Code;
  label: string;
};

type Props<Code extends string> = {
  countries: readonly CountryOption<Code>[];
  labelledBy: string;
  selectedCountry: Code | null;
};

export function DiasporaCountrySelector<Code extends string>({
  countries,
  labelledBy,
  selectedCountry,
}: Readonly<Props<Code>>) {
  return (
    <nav
      aria-labelledby={labelledBy}
      className="flex flex-wrap gap-2"
      data-testid="diaspora-country-selector"
    >
      {countries.map(country => {
        const isSelected = country.code === selectedCountry;

        return (
          <Button
            key={country.code}
            asChild
            variant={isSelected ? 'default' : 'outline'}
            className="min-w-24 rounded-full"
          >
            <Link
              aria-current={isSelected ? 'page' : undefined}
              href={`/member/diaspora?country=${country.code}`}
            >
              {country.label}
            </Link>
          </Button>
        );
      })}
    </nav>
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
