import { useTranslations } from 'next-intl';

const stepsConfig = ['step1', 'step2', 'step3', 'step4'];

export function HowItWorksSection() {
  const t = useTranslations('howItWorks');

  const steps = stepsConfig.map((key, index) => ({
    number: `0${index + 1}`,
    title: t(`${key}.title`),
    description: t(`${key}.description`),
  }));

  return (
    <section className="py-16 lg:py-20 bg-[hsl(var(--surface-strong))]">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">{t('title')}</h2>
          <p className="text-slate-800 font-bold">{t('subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-4 gap-12 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <div key={step.number} className="relative text-center group">
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-[70%] w-full h-[2px] bg-slate-200" />
              )}
              <div className="relative inline-flex items-center justify-center h-20 w-20 rounded-full bg-primary text-white text-2xl font-black mb-6 shadow-lg shadow-primary/20 transition-transform group-hover:scale-110 duration-300">
                {step.number}
              </div>
              <h3 className="text-xl font-bold mb-3 text-slate-900 leading-tight">{step.title}</h3>
              <p className="text-sm text-slate-800 leading-relaxed font-bold">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
