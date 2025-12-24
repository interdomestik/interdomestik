import { CreditCard, Headphones, ShieldCheck, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';

const stepsConfig = [
  { key: 'step1', icon: UserPlus },
  { key: 'step2', icon: CreditCard },
  { key: 'step3', icon: ShieldCheck },
  { key: 'step4', icon: Headphones },
];

export function HowMembershipWorksSection() {
  const t = useTranslations('howMembershipWorks');

  const steps = stepsConfig.map((config, index) => ({
    number: `0${index + 1}`,
    title: t(`${config.key}.title`),
    description: t(`${config.key}.description`),
    Icon: config.icon,
  }));

  return (
    <section className="py-16 lg:py-24">
      <div className="container mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl md:text-4xl font-display font-black mb-4 text-slate-900 tracking-tight">
            {t('title')}
          </h2>
          <p className="text-slate-800 text-lg font-bold">{t('subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-4 gap-8 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <div key={step.number} className="relative text-center group">
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-[60%] w-[80%] h-[3px] bg-gradient-to-r from-primary/30 to-transparent rounded-full" />
              )}
              <div className="relative inline-flex items-center justify-center h-24 w-24 rounded-3xl bg-primary text-white mb-6 shadow-xl shadow-primary/20 transition-transform group-hover:scale-110 duration-300">
                <step.Icon className="h-10 w-10" />
                <span className="absolute -top-2 -right-2 h-8 w-8 rounded-full bg-white text-primary text-sm font-black flex items-center justify-center shadow-md border-2 border-primary/20">
                  {step.number}
                </span>
              </div>
              <h3 className="text-xl font-black mb-3 text-slate-900">{step.title}</h3>
              <p className="text-sm text-slate-800 leading-relaxed font-bold px-2">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
