import { Building2, Car, Heart, Percent, Scale, Shield } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Link from 'next/link';

export function generateViewport() {
  return {
    themeColor: [
      { media: '(prefers-color-scheme: light)', color: 'white' },
      { media: '(prefers-color-scheme: dark)', color: 'black' },
    ],
  };
}

// Partner categories with sample data
const PARTNER_CATEGORIES = [
  {
    id: 'insurance',
    icon: Shield,
    partners: [
      { name: 'Sigal', discount: '15%', logo: null },
      { name: 'Illyria', discount: '10%', logo: null },
      { name: 'Sigma', discount: '12%', logo: null },
    ],
  },
  {
    id: 'legal',
    icon: Scale,
    partners: [
      { name: 'Avokatët e Kosovës', discount: '20%', logo: null },
      { name: 'JurisConsult', discount: '15%', logo: null },
    ],
  },
  {
    id: 'automotive',
    icon: Car,
    partners: [
      { name: 'Auto Servis Pro', discount: '10%', logo: null },
      { name: 'CarFix Center', discount: '15%', logo: null },
    ],
  },
  {
    id: 'health',
    icon: Heart,
    partners: [
      { name: 'Klinika Amerikane', discount: '10%', logo: null },
      { name: 'EuroLab', discount: '12%', logo: null },
    ],
  },
  {
    id: 'property',
    icon: Building2,
    partners: [{ name: 'ProEstate', discount: '5%', logo: null }],
  },
];

export default async function PartnersPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('partners');

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="container max-w-6xl mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full text-primary text-sm font-medium mb-6">
            <Percent className="h-4 w-4" />
            {t('memberExclusive')}
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">{t('title')}</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>

        {/* Partner Categories */}
        <div className="space-y-12">
          {PARTNER_CATEGORIES.map(category => {
            const Icon = category.icon;
            return (
              <div key={category.id}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-xl font-bold">{t(`categories.${category.id}`)}</h2>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {category.partners.map(partner => (
                    <div
                      key={partner.name}
                      className="bg-white rounded-xl shadow-md p-6 flex items-center gap-4 hover:shadow-lg transition-shadow"
                    >
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground">
                        {partner.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold">{partner.name}</p>
                        <p className="text-sm text-muted-foreground">{t('discountLabel')}</p>
                      </div>
                      <div className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-bold">
                        {partner.discount}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-16 text-center">
          <div className="bg-primary/5 rounded-2xl p-8">
            <h3 className="text-xl font-bold mb-2">{t('ctaTitle')}</h3>
            <p className="text-muted-foreground mb-4">{t('ctaDescription')}</p>
            <Link
              href="/pricing"
              className="inline-flex items-center px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 transition-colors"
            >
              {t('ctaButton')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
