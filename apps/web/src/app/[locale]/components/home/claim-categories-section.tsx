import { Link } from '@/i18n/routing';
import { ArrowRight, Car, Home, Plane, Stethoscope } from 'lucide-react';
import { useTranslations } from 'next-intl';

const categoriesConfig = [
  { icon: Car, key: 'vehicle', href: '/dashboard/claims/new?category=vehicle' },
  { icon: Home, key: 'property', href: '/dashboard/claims/new?category=property' },
  { icon: Stethoscope, key: 'injury', href: '/dashboard/claims/new?category=injury' },
  { icon: Plane, key: 'travel', href: '/dashboard/claims/new?category=travel' },
];

export function ClaimCategoriesSection() {
  const t = useTranslations('claimCategories');

  return (
    <section className="py-16 lg:py-20">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">{t('title')}</h2>
          <p className="text-[hsl(var(--muted-500))] max-w-2xl mx-auto">{t('subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {categoriesConfig.map((category, index) => (
            <Link
              key={category.key}
              href={category.href}
              className="group glass-card rounded-xl p-6 card-lift animate-fade-in hover:ring-2 hover:ring-[hsl(var(--primary))] transition-all"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="h-14 w-14 rounded-xl brand-gradient flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <category.icon className="h-7 w-7 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{t(`${category.key}.title`)}</h3>
              <p className="text-[hsl(var(--muted-500))] text-sm mb-3">
                {t(`${category.key}.description`)}
              </p>
              <p className="text-xs text-[hsl(var(--muted-400))]">{t(`${category.key}.examples`)}</p>
              <div className="mt-4 flex items-center text-sm font-medium text-[hsl(var(--primary))] group-hover:gap-2 transition-all">
                {t('startClaim')}
                <ArrowRight className="h-4 w-4 ml-1" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
