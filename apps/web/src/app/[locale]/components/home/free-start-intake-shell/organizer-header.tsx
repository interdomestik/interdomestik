import { getActiveStepIndex } from './helpers';
import type { FreeStartCopy, StepId } from './types';

const STEPS = ['choose', 'details', 'preview'] as const;

export function OrganizerHeader({ step, t }: { step: StepId; t: FreeStartCopy }) {
  const activeIndex = getActiveStepIndex(step);

  return (
    <header className="grid gap-7 border-b border-[#001a33]/15 pb-8 lg:grid-cols-[0.7fr_1.3fr]">
      <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.22em] text-[#007f82]">
        <span aria-hidden="true" className="h-px w-10 bg-[#008f91]" />
        {t('eyebrow')}
      </div>
      <div className="space-y-4">
        <h2 className="font-serif text-4xl leading-[1.05] text-[#001a33] sm:text-5xl">
          {t('title')}
        </h2>
        <p className="max-w-2xl text-base leading-7 text-[#36475a] sm:text-lg">{t('subtitle')}</p>
        <ol aria-label={t('eyebrow')} className="grid max-w-2xl grid-cols-3 gap-2 pt-2">
          {STEPS.map((item, index) => (
            <li
              key={item}
              aria-current={index === activeIndex ? 'step' : undefined}
              className="space-y-2 text-xs font-semibold text-[#405267]"
            >
              <span
                aria-hidden="true"
                className={`block h-1 rounded-full ${index <= activeIndex ? 'bg-[#008f91]' : 'bg-[#cfd7dc]'}`}
              />
              <span className="block leading-5">{t(`steps.${item}`)}</span>
            </li>
          ))}
        </ol>
      </div>
    </header>
  );
}
