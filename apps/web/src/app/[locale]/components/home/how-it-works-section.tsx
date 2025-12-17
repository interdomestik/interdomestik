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
          <p className="text-[hsl(var(--muted-500))]">{t('subtitle')}</p>
        </div>

        <div className="grid md:grid-cols-4 gap-8 max-w-5xl mx-auto">
          {steps.map((step, index) => (
            <div key={step.number} className="relative text-center">
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-8 left-[60%] w-full h-0.5 bg-[hsl(var(--border))]" />
              )}
              <div className="relative inline-flex items-center justify-center h-16 w-16 rounded-full brand-gradient text-white text-xl font-bold mb-4">
                {step.number}
              </div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-sm text-[hsl(var(--muted-500))]">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
