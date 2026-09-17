import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';

type CountryOption = {
  code: string;
  label: string;
};

type Props = {
  countries: readonly CountryOption[];
  label: string;
  selectedCountry: string | null;
};

export function DiasporaCountrySelector({ countries, label, selectedCountry }: Readonly<Props>) {
  return (
    <nav
      aria-label={label}
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
