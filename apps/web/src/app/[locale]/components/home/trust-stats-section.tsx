import { Award, Clock, Shield, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

export function TrustStatsSection() {
  const t = useTranslations('trustStats');

  const stats = [
    { value: t('recovered'), label: t('recoveredLabel'), icon: Award, color: 'text-emerald-500' },
    { value: t('cases'), label: t('casesLabel'), icon: Shield, color: 'text-blue-500' },
    { value: t('members'), label: t('membersLabel'), icon: Users, color: 'text-purple-500' },
    { value: t('response'), label: t('responseLabel'), icon: Clock, color: 'text-amber-500' },
  ];

  // Partner logos - real partners and placeholders
  const partners = [
    {
      name: 'Mint Fintech Group',
      logo: '/partners/mint-fintech.png',
      url: 'https://mint.com.mk/',
    },
    {
      name: 'Auto Service Partner',
      initial: 'AS',
      placeholder: true,
    },
    {
      name: 'Medical Center',
      initial: 'MC',
      placeholder: true,
    },
    {
      name: 'Legal Partners',
      initial: 'LP',
      placeholder: true,
    },
  ];

  return (
    <section className="py-16 lg:py-20 bg-slate-900 text-white">
      <div className="container mx-auto px-4">
        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-16">
          {stats.map((stat, index) => (
            <div key={index} className="text-center group">
              <div
                className={`inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-white/10 ${stat.color} mb-4 group-hover:scale-110 transition-transform`}
              >
                <stat.icon className="h-7 w-7" />
              </div>
              <div className="text-4xl font-black mb-1 tracking-tight">{stat.value}</div>
              <div className="text-sm text-slate-400 font-medium uppercase tracking-wider">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Partner Logos */}
        <div className="border-t border-slate-800 pt-12">
          <p className="text-center text-sm text-slate-500 font-medium uppercase tracking-wider mb-8">
            {t('partnersTitle')}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
            {partners.map((partner, index) => (
              <div key={index} className="group">
                {partner.placeholder ? (
                  <div
                    className="h-12 w-28 rounded-lg bg-slate-800 flex items-center justify-center text-slate-500 font-bold text-sm"
                    title={partner.name}
                  >
                    {partner.initial}
                  </div>
                ) : (
                  <a
                    href={partner.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block h-12 w-28 rounded-lg bg-white/10 p-2 hover:bg-white/20 transition-colors"
                    title={partner.name}
                  >
                    <Image
                      src={partner.logo!}
                      alt={partner.name}
                      width={112}
                      height={48}
                      className="h-full w-full object-contain filter brightness-0 invert opacity-70 group-hover:opacity-100 transition-opacity"
                    />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
