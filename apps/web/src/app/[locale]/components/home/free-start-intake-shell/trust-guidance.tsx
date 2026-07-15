import { Check } from 'lucide-react';

import { EVIDENCE_ITEM_IDS } from './constants';
import type { CategoryId, FreeStartCopy } from './types';

function Panel({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <section data-testid={testId} className="border-t border-[#001a33]/15 pt-5">
      {children}
    </section>
  );
}

export function TrustGuidance({
  selectedCategory,
  t,
}: {
  selectedCategory: CategoryId | null;
  t: FreeStartCopy;
}) {
  const evidence = selectedCategory ? `trust.evidence.${selectedCategory}` : null;

  return (
    <div className="space-y-5">
      <Panel testId="free-start-evidence-guidance">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#007f82]">
          {t('trust.evidence.badge')}
        </p>
        <h4 className="mt-2 text-base font-bold leading-6 text-[#001a33]">
          {evidence ? t(`${evidence}.heading`) : t('trust.evidence.placeholder.heading')}
        </h4>
        <p className="mt-1 text-sm leading-6 text-[#526274]">
          {evidence ? t(`${evidence}.body`) : t('trust.evidence.placeholder.body')}
        </p>
        {evidence ? (
          <ul className="mt-3 space-y-2">
            {EVIDENCE_ITEM_IDS.map(item => (
              <li key={item} className="flex items-start gap-2 text-sm leading-6 text-[#33485c]">
                <Check aria-hidden="true" className="mt-1 h-4 w-4 shrink-0 text-[#008f91]" />
                <span>{t(`${evidence}.items.${item}`)}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Panel>
      <Panel testId="free-start-privacy-note">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#007f82]">
          {t('trust.privacy.badge')}
        </p>
        <h4 className="mt-2 text-base font-bold text-[#001a33]">{t('trust.privacy.heading')}</h4>
        <p className="mt-1 text-sm leading-6 text-[#526274]">{t('trust.privacy.body')}</p>
      </Panel>
      <Panel testId="free-start-triage-note">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#8a5a00]">
          {t('trust.triage.badge')}
        </p>
        <h4 className="mt-2 text-base font-bold text-[#001a33]">{t('trust.triage.heading')}</h4>
        <p className="mt-1 text-sm leading-6 text-[#526274]">{t('trust.triage.body')}</p>
      </Panel>
    </div>
  );
}
