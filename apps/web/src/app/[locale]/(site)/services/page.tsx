import { Link } from '@/i18n/routing';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@interdomestik/ui';
import {
  ArrowRight,
  Car,
  ChevronDown,
  Clock,
  Home,
  Lock,
  Plane,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';

interface ServicesPageProps {
  params: Promise<{ locale: string }>;
}

export async function generateMetadata({ params }: ServicesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'services.meta' });

  return {
    title: t('title'),
    description: t('description'),
  };
}

export default async function ServicesPage({ params }: ServicesPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'services' });

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero Section */}
      <section className="relative py-20 lg:py-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="container px-4 md:px-6 relative z-10">
          <div className="flex flex-col items-center text-center space-y-4 max-w-3xl mx-auto">
            <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-transparent">
              {t('hero.title')}
            </h1>
            <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
              {t('hero.subtitle')}
            </p>
            <div className="pt-4">
              <Link href="/dashboard/claims/new">
                <Button size="lg" className="rounded-full shadow-lg hover:shadow-primary/25">
                  {t('hero.cta')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Solutions Grid */}
      <section className="py-16 bg-muted/30">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight">{t('solutions.title')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <ServiceCard
              icon={<Car className="h-8 w-8 text-primary" />}
              title={t('solutions.vehicle.title')}
              description={t('solutions.vehicle.description')}
            />
            <ServiceCard
              icon={<Home className="h-8 w-8 text-primary" />}
              title={t('solutions.property.title')}
              description={t('solutions.property.description')}
            />
            <ServiceCard
              icon={<Stethoscope className="h-8 w-8 text-primary" />}
              title={t('solutions.injury.title')}
              description={t('solutions.injury.description')}
            />
            <ServiceCard
              icon={<Plane className="h-8 w-8 text-primary" />}
              title={t('solutions.flight.title')}
              description={t('solutions.flight.description')}
            />
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-16">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight">{t('process.title')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                1
              </div>
              <h3 className="text-xl font-semibold">{t('process.step1.title')}</h3>
              <p className="text-muted-foreground">{t('process.step1.description')}</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                2
              </div>
              <h3 className="text-xl font-semibold">{t('process.step2.title')}</h3>
              <p className="text-muted-foreground">{t('process.step2.description')}</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-xl font-bold text-primary">
                3
              </div>
              <h3 className="text-xl font-semibold">{t('process.step3.title')}</h3>
              <p className="text-muted-foreground">{t('process.step3.description')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Speed & Safety Panel */}
      <section className="py-16 bg-primary text-primary-foreground">
        <div className="container px-4 md:px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold tracking-tight text-white">{t('safety.title')}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center space-y-2 p-6 rounded-lg bg-white/10 backdrop-blur-sm">
              <Clock className="h-10 w-10 mb-2 text-white" />
              <h3 className="text-xl font-bold text-white">{t('safety.speed.title')}</h3>
              <p className="text-blue-100">{t('safety.speed.description')}</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-2 p-6 rounded-lg bg-white/10 backdrop-blur-sm">
              <ShieldCheck className="h-10 w-10 mb-2 text-white" />
              <h3 className="text-xl font-bold text-white">{t('safety.response.title')}</h3>
              <p className="text-blue-100">{t('safety.response.description')}</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-2 p-6 rounded-lg bg-white/10 backdrop-blur-sm">
              <Lock className="h-10 w-10 mb-2 text-white" />
              <h3 className="text-xl font-bold text-white">{t('safety.secure.title')}</h3>
              <p className="text-blue-100">{t('safety.secure.description')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16">
        <div className="container px-4 md:px-6 max-w-3xl border border-border/50 rounded-2xl bg-card shadow-sm p-8 md:p-12">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold tracking-tight">{t('faq.title')}</h2>
          </div>
          <div className="space-y-4">
            <details className="group border-b border-border/50 pb-4">
              <summary className="flex cursor-pointer items-center justify-between font-medium text-lg list-none outline-none">
                {t('faq.q1')}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-muted-foreground">{t('faq.a1')}</p>
            </details>
            <details className="group border-b border-border/50 pb-4">
              <summary className="flex cursor-pointer items-center justify-between font-medium text-lg list-none outline-none">
                {t('faq.q2')}
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-muted-foreground">{t('faq.a2')}</p>
            </details>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-muted/30">
        <div className="container px-4 md:px-6 text-center">
          <h2 className="text-3xl font-bold tracking-tight mb-6">{t('finalCta.title')}</h2>
          <Link href="/dashboard/claims/new">
            <Button size="lg" className="rounded-full h-12 px-8 text-base">
              {t('finalCta.btn')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

function ServiceCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="border-border/50 shadow-sm hover:shadow-md transition-all duration-300">
      <CardHeader>
        <div className="mb-4">{icon}</div>
        <CardTitle className="text-xl">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-base">{description}</CardDescription>
      </CardContent>
    </Card>
  );
}
