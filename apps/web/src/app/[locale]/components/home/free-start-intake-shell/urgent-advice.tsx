import { ShieldAlert } from 'lucide-react';

import { focusFragmentTarget } from './arrival-navigation';
import type { CategoryId, FreeStartCopy } from './types';

type AdvisedCategory = 'property' | 'vehicle';

const ADVICE_ITEM_KEYS: Readonly<Record<AdvisedCategory, ReadonlyArray<string>>> = {
  property: ['danger', 'utilities', 'contact'],
  vehicle: ['injury', 'movement', 'contact'],
};

type Props = Readonly<{
  selectedCategory: CategoryId | null;
  t: FreeStartCopy;
}>;

function advisedCategory(category: CategoryId | null): AdvisedCategory | null {
  return category === 'property' || category === 'vehicle' ? category : null;
}

/**
 * Concise qualified urgent advice for the supported reporting categories. It replaces the former
 * question stages: the advice stays visible beside the facts instead of gating them, and it never
 * promises a response, a medical judgement or coverage.
 */
export function UrgentAdvice({ selectedCategory, t }: Props) {
  const category = advisedCategory(selectedCategory);
  if (!category) return null;

  return (
    <section
      aria-labelledby="free-start-urgent-advice-heading"
      data-category={category}
      data-testid="free-start-urgent-advice"
      className="flex items-start gap-3 rounded-2xl border border-[#b77a08]/45 bg-[#fff8e8] p-4 text-[#173b43] sm:p-5"
    >
      <ShieldAlert aria-hidden="true" className="mt-1 h-6 w-6 shrink-0 text-[#8a5a00]" />
      <div className="space-y-2">
        <h3
          id="free-start-urgent-advice-heading"
          tabIndex={-1}
          className="scroll-mt-24 text-lg font-bold text-[#001a33] outline-none"
        >
          {t('urgentAdvice.heading')}
        </h3>
        <ul className="space-y-1 text-base leading-7">
          {ADVICE_ITEM_KEYS[category].map(item => (
            <li key={item}>{t(`urgentAdvice.${category}.${item}`)}</li>
          ))}
        </ul>
        <a
          href="#free-start-narrative-heading"
          onClick={focusFragmentTarget}
          className="inline-flex min-h-11 items-center rounded-lg text-base font-semibold text-[#006b7b] underline underline-offset-4 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
        >
          {t('details.summary')}
        </a>
      </div>
    </section>
  );
}
