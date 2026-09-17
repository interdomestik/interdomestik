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

import { DiasporaCountryRequiredCard, DiasporaCountrySelector } from './diaspora-country-selector';

const QUICKSTART_COUNTRIES = [
  { code: 'DE', labelKey: 'selector.options.DE' },
  { code: 'CH', labelKey: 'selector.options.CH' },
  { code: 'AT', labelKey: 'selector.options.AT' },
  { code: 'IT', labelKey: 'selector.options.IT' },
] as const;

type SupportedQuickstartCountry = (typeof QUICKSTART_COUNTRIES)[number]['code'];

function resolveCountryCode(
  rawCountry: string | string[] | undefined
): SupportedQuickstartCountry | null {
  if (typeof rawCountry !== 'string') {
    return null;
  }

  const parsed = CountryCodeSchema.safeParse(rawCountry.toUpperCase());
  if (!parsed.success) {
    return null;
  }

  const supportedCountry = QUICKSTART_COUNTRIES.find(country => country.code === parsed.data);
  return supportedCountry?.code ?? null;
}

function buildClaimStartHref(selectedCountry: SupportedQuickstartCountry): string {
  const params = new URLSearchParams({
    category: 'vehicle',
    source: 'diaspora-green-card',
    country: selectedCountry,
    incidentLocation: 'abroad',
  });

  return `/member/claims/new?${params.toString()}`;
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ country?: string | string[] }>;
};

export default async function DiasporaPage({ params, searchParams }: Readonly<Props>) {
  const { locale } = await params;
  setRequestLocale(locale);

  const search = await searchParams;
  const selectedCountry = resolveCountryCode(search?.country);
  const t = await getTranslations('diaspora');
  const countryContext = selectedCountry
    ? {
        code: selectedCountry,
        guidance: countryGuidanceService.getGuidance(selectedCountry, locale),
      }
    : null;
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
              <p id="diaspora-country" className="text-sm font-semibold text-slate-900">
                {t('selector.label')}
              </p>
              <p className="text-sm text-slate-500">{t('selector.hint')}</p>
            </div>
            <DiasporaCountrySelector
              countries={QUICKSTART_COUNTRIES.map(country => ({
                code: country.code,
                label: t(country.labelKey),
              }))}
              labelledBy="diaspora-country"
              selectedCountry={selectedCountry}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_0.95fr]">
        {countryContext ? (
          <Card className="rounded-[2rem] border border-slate-200/80 bg-white">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-sky-50 p-3 text-sky-700">
                  <Siren className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle data-testid="diaspora-selected-country">
                    {t(`selector.options.${countryContext.code}`)}
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
                        {countryContext.guidance.emergencyNumbers.police}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-slate-600">{t('guidance.ambulance')}</dt>
                      <dd className="font-semibold text-slate-950">
                        {countryContext.guidance.emergencyNumbers.ambulance}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-slate-600">{t('guidance.fire')}</dt>
                      <dd className="font-semibold text-slate-950">
                        {countryContext.guidance.emergencyNumbers.fire}
                      </dd>
                    </div>
                    {countryContext.guidance.emergencyNumbers.general ? (
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-slate-600">{t('guidance.general')}</dt>
                        <dd className="font-semibold text-slate-950">
                          {countryContext.guidance.emergencyNumbers.general}
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
                        {countryContext.guidance.rules.policeRequired
                          ? t('guidance.policeRequired')
                          : t('guidance.policeNotRequired')}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white p-3">
                      <p className="font-semibold text-slate-900">
                        {countryContext.guidance.rules.europeanAccidentStatementAllowed
                          ? t('guidance.europeanFormAllowed')
                          : t('guidance.europeanFormNotAllowed')}
                      </p>
                    </div>
                    {countryContext.guidance.rules.additionalNotes ? (
                      <div className="rounded-xl bg-white p-3">
                        <p className="font-semibold text-slate-900">{t('guidance.notes')}</p>
                        <p className="mt-1 text-slate-600">
                          {countryContext.guidance.rules.additionalNotes}
                        </p>
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
                  {countryContext.guidance.rules.firstSteps.map(step => (
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
        ) : (
          <DiasporaCountryRequiredCard
            title={t('selector.required.title')}
            description={t('selector.required.description')}
          />
        )}

        <div className="space-y-6">
          <Card className="rounded-[2rem] border border-slate-200/80 bg-slate-950 text-white">
            <CardHeader>
              <CardTitle>{t('actions.title')}</CardTitle>
              <CardDescription className="text-slate-300">
                {t(countryContext ? 'actions.description' : 'actions.selectionRequired')}
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

              {countryContext ? (
                <Button
                  asChild
                  size="lg"
                  variant="secondary"
                  className="w-full justify-between rounded-2xl"
                >
                  <Link href={buildClaimStartHref(countryContext.code)}>
                    <span>{t('actions.claim')}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
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
