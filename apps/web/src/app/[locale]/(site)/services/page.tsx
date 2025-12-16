import { Link } from '@/i18n/routing';
import { contactInfo } from '@/lib/contact';
import { flags } from '@/lib/flags';
import { Button } from '@interdomestik/ui';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';

type Props = {
  params: Promise<{ locale: string }>;
};

export default async function ServicesPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('servicesPage');
  const { phone, whatsapp } = contactInfo;
  const telHref = phone ? `tel:${phone.replace(/\s+/g, '')}` : undefined;

  const cases = (t.raw('cases') as { title: string; description: string }[]) || [];
  const steps = (t.raw('steps') as { title: string; description: string }[]) || [];
  const faqs = (t.raw('faq') as { question: string; answer: string }[]) || [];

  return (
    <main className="min-h-screen bg-[hsl(var(--background))]">
      <section className="py-16 lg:py-24 brand-gradient text-white">
        <div className="container mx-auto px-4 text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-sm mb-4">
            <ShieldCheck className="h-4 w-4" />
            {t('badge')}
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">{t('title')}</h1>
          <p className="text-white/80 text-lg md:text-xl mb-8">{t('subtitle')}</p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link href="/dashboard/claims/new">
              <Button size="lg" className="w-full sm:w-auto">
                {t('startClaim')}
              </Button>
            </Link>
            {whatsapp && (
              <a href={whatsapp}>
                <Button variant="secondary" size="lg" className="w-full sm:w-auto gap-2">
                  <MessageCircle className="h-4 w-4" />
                  {t('whatsapp')}
                </Button>
              </a>
            )}
            {telHref && (
              <a href={telHref}>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full sm:w-auto gap-2 text-white border-white"
                >
                  <Phone className="h-4 w-4" />
                  {phone}
                </Button>
              </a>
            )}
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="container mx-auto px-4">
          <div className="mb-8 text-center">
            <p className="text-sm uppercase tracking-wide text-[hsl(var(--muted-500))]">
              {t('whatWeSolve')}
            </p>
            <h2 className="text-3xl font-display font-bold mt-2">{t('casesTitle')}</h2>
            <p className="text-[hsl(var(--muted-500))] max-w-2xl mx-auto mt-2">
              {t('casesSubtitle')}
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {cases.map(item => (
              <Card key={item.title} className="h-full">
                <CardHeader>
                  <CardTitle className="text-lg">{item.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-[hsl(var(--muted-600))]">
                  {item.description}
                </CardContent>
              </Card>
            ))}
            {flags.flightDelay && (
              <Card className="border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/5">
                <CardHeader>
                  <CardTitle className="text-lg">{t('flightDelay.title')}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-[hsl(var(--muted-700))] space-y-2">
                  <p>{t('flightDelay.description')}</p>
                  <Link href="/dashboard/claims/new?category=flight_delay">
                    <Button variant="link" className="px-0">
                      {t('flightDelay.cta')}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </section>

      <section className="py-14 bg-[hsl(var(--surface-strong))] border-y">
        <div className="container mx-auto px-4">
          <div className="mb-8 text-center">
            <p className="text-sm uppercase tracking-wide text-[hsl(var(--muted-500))]">
              {t('howItWorks')}
            </p>
            <h2 className="text-3xl font-display font-bold mt-2">{t('stepsTitle')}</h2>
          </div>
          <div className="grid md:grid-cols-4 gap-6">
            {steps.map((step, idx) => (
              <Card key={step.title} className="h-full">
                <CardHeader className="pb-2 flex flex-row items-center gap-3">
                  <div className="h-10 w-10 rounded-full brand-gradient text-white flex items-center justify-center text-sm font-semibold">
                    {idx + 1}
                  </div>
                  <CardTitle className="text-base">{step.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-[hsl(var(--muted-600))]">
                  {step.description}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="container mx-auto px-4">
          <div className="mb-8 text-center">
            <p className="text-sm uppercase tracking-wide text-[hsl(var(--muted-500))]">
              {t('benefits')}
            </p>
            <h2 className="text-3xl font-display font-bold mt-2">{t('benefitsTitle')}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {['speed', 'safety', 'people'].map(key => (
              <Card key={key}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">{t(`benefit.${key}.title`)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-[hsl(var(--muted-600))]">
                  {t(`benefit.${key}.description`)}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14 bg-[hsl(var(--surface-strong))] border-t">
        <div className="container mx-auto px-4">
          <div className="mb-6 text-center">
            <p className="text-sm uppercase tracking-wide text-[hsl(var(--muted-500))]">FAQ</p>
            <h2 className="text-2xl font-display font-bold mt-2">{t('faqTitle')}</h2>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {faqs.map(item => (
              <Card key={item.question}>
                <CardHeader>
                  <CardTitle className="text-base">{item.question}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-[hsl(var(--muted-600))]">
                  {item.answer}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="py-14">
        <div className="container mx-auto px-4">
          <div className="glass-card p-6 md:p-8 rounded-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h3 className="text-2xl font-display font-bold mb-2">{t('contactTitle')}</h3>
              <p className="text-[hsl(var(--muted-600))] max-w-xl">{t('contactSubtitle')}</p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/dashboard/claims/new">
                <Button className="w-full sm:w-auto">{t('startClaim')}</Button>
              </Link>
              {whatsapp && (
                <a href={whatsapp} className="w-full sm:w-auto">
                  <Button variant="secondary" className="w-full sm:w-auto gap-2">
                    <MessageCircle className="h-4 w-4" />
                    {t('whatsapp')}
                  </Button>
                </a>
              )}
              {telHref && (
                <a href={telHref} className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full sm:w-auto gap-2">
                    <Phone className="h-4 w-4" />
                    {phone}
                  </Button>
                </a>
              )}
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
