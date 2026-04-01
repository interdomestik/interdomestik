import { Link } from '@/i18n/routing';
import { getSupportContacts } from '@/lib/support-contacts';
import { CountryCodeSchema, countryGuidanceService } from '@interdomestik/domain-country-guidance';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import { ArrowRight, Phone, ShieldCheck, Siren, TriangleAlert } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

const QUICKSTART_COUNTRIES = [
  { code: 'DE', labelKey: 'selector.options.DE' },
  { code: 'CH', labelKey: 'selector.options.CH' },
  { code: 'AT', labelKey: 'selector.options.AT' },
  { code: 'IT', labelKey: 'selector.options.IT' },
] as const;

type SupportedQuickstartCountry = (typeof QUICKSTART_COUNTRIES)[number]['code'];

function resolveCountryCode(rawCountry: string | undefined): SupportedQuickstartCountry {
  const parsed = CountryCodeSchema.safeParse(rawCountry?.toUpperCase());
  if (!parsed.success) {
    return 'DE';
  }

  const allowedCodes = QUICKSTART_COUNTRIES.map(country => country.code);
  if (!allowedCodes.includes(parsed.data as SupportedQuickstartCountry)) {
    return 'DE';
  }

  return parsed.data as SupportedQuickstartCountry;
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ country?: string }>;
};

export default async function DiasporaPage({ params, searchParams }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const search = await searchParams;
  const selectedCountry = resolveCountryCode(search?.country);
  const t = await getTranslations('diaspora');
  const guidance = countryGuidanceService.getGuidance(selectedCountry, locale);
  const contacts = getSupportContacts({ locale });

  return (
    <div className="space-y-6 pb-10" data-testid="diaspora-page">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200/80 bg-gradient-to-br from-emerald-50 via-white to-sky-50 shadow-sm">
        <div className="flex flex-col gap-5 p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-3">
              <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-xs uppercase">
                {t('eyebrow')}
              </Badge>
              <div className="space-y-2">
                <h1 className="text-3xl font-black tracking-tight text-slate-950">{t('title')}</h1>
                <p className="max-w-3xl text-sm leading-6 text-slate-600 md:text-base">
                  {t('description')}
                </p>
              </div>
            </div>
            <div className="hidden rounded-3xl bg-emerald-600/10 p-4 text-emerald-700 md:block">
              <ShieldCheck className="h-8 w-8" />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-slate-200 bg-white/90 p-4 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.55)]">
            <div className="mb-3">
              <p className="text-sm font-semibold text-slate-900">{t('selector.label')}</p>
              <p className="text-sm text-slate-500">{t('selector.hint')}</p>
            </div>
            <div className="flex flex-wrap gap-2" data-testid="diaspora-country-selector">
              {QUICKSTART_COUNTRIES.map(country => {
                const isSelected = country.code === selectedCountry;
                return (
                  <Button
                    key={country.code}
                    asChild
                    variant={isSelected ? 'default' : 'outline'}
                    className="min-w-24 rounded-full"
                  >
                    <Link href={`/member/diaspora?country=${country.code}`}>
                      {t(country.labelKey)}
                    </Link>
                  </Button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        <Card className="rounded-[2rem] border border-slate-200/80 bg-white">
          <CardHeader className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
                <Siren className="h-5 w-5" />
              </div>
              <div>
                <CardTitle data-testid="diaspora-selected-country">
                  {t(`selector.options.${selectedCountry}`)}
                </CardTitle>
                <CardDescription>{t('guidance.countryDescription')}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  {t('guidance.emergency')}
                </p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-600">{t('guidance.police')}</dt>
                    <dd className="font-semibold text-slate-950">
                      {guidance.emergencyNumbers.police}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-600">{t('guidance.ambulance')}</dt>
                    <dd className="font-semibold text-slate-950">
                      {guidance.emergencyNumbers.ambulance}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <dt className="text-slate-600">{t('guidance.fire')}</dt>
                    <dd className="font-semibold text-slate-950">
                      {guidance.emergencyNumbers.fire}
                    </dd>
                  </div>
                  {guidance.emergencyNumbers.general ? (
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-slate-600">{t('guidance.general')}</dt>
                      <dd className="font-semibold text-slate-950">
                        {guidance.emergencyNumbers.general}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  {t('guidance.rules')}
                </p>
                <div className="mt-3 space-y-3 text-sm text-slate-700">
                  <div className="rounded-xl bg-white p-3">
                    <p className="font-semibold text-slate-900">
                      {guidance.rules.policeRequired
                        ? t('guidance.policeRequired')
                        : t('guidance.policeNotRequired')}
                    </p>
                  </div>
                  <div className="rounded-xl bg-white p-3">
                    <p className="font-semibold text-slate-900">
                      {guidance.rules.europeanAccidentStatementAllowed
                        ? t('guidance.europeanFormAllowed')
                        : t('guidance.europeanFormNotAllowed')}
                    </p>
                  </div>
                  {guidance.rules.additionalNotes ? (
                    <div className="rounded-xl bg-white p-3">
                      <p className="font-semibold text-slate-900">{t('guidance.notes')}</p>
                      <p className="mt-1 text-slate-600">{guidance.rules.additionalNotes}</p>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-3">
                <div className="rounded-2xl bg-amber-100 p-2 text-amber-700">
                  <TriangleAlert className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold text-amber-950">{t('guidance.firstSteps')}</p>
                  <p className="text-sm text-amber-900">{t('guidance.firstStepsHint')}</p>
                </div>
              </div>
              <ol className="mt-4 space-y-3">
                {guidance.rules.firstSteps.map(step => (
                  <li
                    key={step.step}
                    className="flex gap-3 rounded-2xl border border-amber-200/80 bg-white/80 p-3"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-900">
                      {step.step}
                    </span>
                    <span className="text-sm leading-6 text-slate-800">{step.description}</span>
                  </li>
                ))}
              </ol>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[2rem] border border-slate-200/80 bg-slate-950 text-white">
            <CardHeader>
              <CardTitle>{t('actions.title')}</CardTitle>
              <CardDescription className="text-slate-300">
                {t('actions.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                asChild
                size="lg"
                className="w-full justify-between rounded-2xl bg-emerald-500 hover:bg-emerald-600"
              >
                <a href={contacts.telHref}>
                  <span className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    {t('actions.support')}
                  </span>
                  <span className="text-sm font-semibold">{contacts.phoneDisplay}</span>
                </a>
              </Button>

              {contacts.whatsappHref ? (
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="w-full justify-between rounded-2xl border-slate-700 bg-transparent text-white hover:bg-slate-900"
                >
                  <a href={contacts.whatsappHref} target="_blank" rel="noopener noreferrer">
                    <span>{t('actions.whatsapp')}</span>
                    <ArrowRight className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}

              <Button
                asChild
                size="lg"
                variant="secondary"
                className="w-full justify-between rounded-2xl"
              >
                <Link href="/member/claims/new?category=travel">
                  <span>{t('actions.claim')}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-[2rem] border border-slate-200/80 bg-white">
            <CardHeader>
              <CardTitle>{t('boundary.title')}</CardTitle>
              <CardDescription>{t('boundary.description')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-600">
              <p>{t('boundary.pointOne')}</p>
              <p>{t('boundary.pointTwo')}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
