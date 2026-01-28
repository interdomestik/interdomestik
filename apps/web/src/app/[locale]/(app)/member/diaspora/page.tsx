import { Button, Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { ShieldCheck, Plane, Users, ArrowRight } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';

export default async function DiasporaPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations('diaspora');

  const cards = [
    {
      key: 'green_card',
      icon: ShieldCheck,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      key: 'travel',
      icon: Plane,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      key: 'family',
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
    },
  ];

  return (
    <div className="space-y-8 animate-fade-in pb-10" data-testid="diaspora-page">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {cards.map(card => (
          <Card
            key={card.key}
            className="border-none shadow-premium hover:shadow-xl transition-all duration-300"
          >
            <CardHeader>
              <div
                className={`w-12 h-12 rounded-2xl ${card.bgColor} flex items-center justify-center ${card.color} mb-2`}
              >
                <card.icon className="w-6 h-6" />
              </div>
              <CardTitle className="text-xl">{t(`cards.${card.key}.title`)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                {t(`cards.${card.key}.description`)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-primary text-primary-foreground border-none shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32 blur-3xl" />
        <CardContent className="p-8 md:p-12 flex flex-col md:flex-row items-center justify-between gap-8 relative">
          <div className="space-y-4 text-center md:text-left">
            <h2 className="text-2xl md:text-3xl font-black">{t('cta.title')}</h2>
          </div>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="font-bold rounded-2xl h-14 px-8 text-lg shadow-lg hover:shadow-xl transition-all"
          >
            <Link href="/member/membership">
              {t('cta.button')} <ArrowRight className="ml-2 w-5 h-5" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
