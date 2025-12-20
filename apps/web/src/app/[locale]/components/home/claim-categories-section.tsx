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

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {categoriesConfig.map((category, index) => (
            <Link
              key={category.key}
              href={category.href}
              className="group bg-white rounded-2xl p-8 shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 flex flex-col h-full"
              style={{ animationDelay: `${index * 0.1}s` }}
            >
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <category.icon className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-xl font-bold mb-3 text-slate-900">
                {t(`${category.key}.title`)}
              </h3>
              <p className="text-slate-500 text-sm mb-4 leading-relaxed">
                {t(`${category.key}.description`)}
              </p>
              <p className="text-xs font-medium text-slate-400 mt-auto">
                {t(`${category.key}.examples`)}
              </p>
              <div className="mt-6 flex items-center text-sm font-bold text-primary group-hover:translate-x-1 transition-transform">
                {t('startClaim')}
                <ArrowRight className="h-4 w-4 ml-2" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
