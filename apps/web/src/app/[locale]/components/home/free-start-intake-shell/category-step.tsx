import { ArrowRight } from 'lucide-react';

import { CATEGORY_CONFIG } from './constants';
import { PRIMARY_ACTION_CLASS } from './organizer-styles';
import type { CategoryId, FreeStartCopy } from './types';

type Props = Readonly<{
  selectedCategory: CategoryId | null;
  t: FreeStartCopy;
  onContinue: () => void;
  onSelect: (category: CategoryId) => void;
}>;

export function CategoryStep({ selectedCategory, t, onContinue, onSelect }: Props) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        {CATEGORY_CONFIG.map(category => {
          const Icon = category.icon;
          const selected = selectedCategory === category.id;

          return (
            <button
              key={category.id}
              type="button"
              aria-pressed={selected}
              data-testid={`free-start-category-${category.id}`}
              onClick={() => onSelect(category.id)}
              className={`min-h-32 rounded-2xl border p-4 text-left text-base outline-none transition focus-visible:ring-3 focus-visible:ring-[#008f91] focus-visible:ring-offset-2 ${
                selected
                  ? 'border-[#008f91] bg-[#e2f2ef] text-[#001a33]'
                  : 'border-[#001a33]/20 bg-white text-[#001a33] hover:border-[#008f91]'
              }`}
            >
              <Icon aria-hidden="true" className="mb-4 h-6 w-6 text-[#008f91]" />
              <span className="block text-base font-bold leading-6">
                {t(`categories.${category.id}.title`)}
              </span>
              <span className="mt-1 block text-sm leading-5 text-[#526274]">
                {t(`categories.${category.id}.examples`)}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex justify-end">
        <button type="button" onClick={onContinue} className={PRIMARY_ACTION_CLASS}>
          {t('choose.continue')}
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
    </>
  );
}
