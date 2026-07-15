import type { ClaimPack } from '@interdomestik/domain-claims/claim-pack';
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react';

import { getEvidenceCopy, type ResultCopy } from './result-copy';

type Item = ClaimPack['evidenceChecklist']['items'][number];

function EvidenceIcon({ item }: { item: Item }) {
  if (item.likelyAvailable) {
    return <CheckCircle2 aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[#006f72]" />;
  }
  if (item.required) {
    return <AlertTriangle aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[#8a5a00]" />;
  }
  return <Circle aria-hidden="true" className="mt-1 h-5 w-5 shrink-0 text-[#526274]" />;
}

function getStatusKey(item: Item): string {
  if (item.likelyAvailable) return 'available';
  return item.required ? 'required' : 'optional';
}

export function EvidenceSection({
  checklist,
  t,
}: Readonly<{ checklist: ClaimPack['evidenceChecklist']; t: ResultCopy }>) {
  return (
    <section
      data-testid="claim-pack-evidence"
      aria-labelledby="claim-pack-evidence-heading"
      className="space-y-6 px-5 py-8 sm:px-8 lg:px-10 lg:py-10"
    >
      <div className="space-y-2">
        <h4 id="claim-pack-evidence-heading" className="text-2xl font-bold text-[#001a33]">
          {t('evidence.heading')}
        </h4>
        <p className="text-base leading-7 text-[#405267]">
          {t('evidence.summary', {
            available: checklist.likelyAvailableCount,
            required: checklist.requiredCount,
          })}
        </p>
      </div>
      <ul className="grid min-w-0 gap-x-8 gap-y-5 lg:grid-cols-2">
        {checklist.items.map(item => {
          const copy = getEvidenceCopy(t, item.id);
          return (
            <li
              key={item.id}
              className="flex min-w-0 items-start gap-3 border-t border-[#001a33]/15 pt-4"
            >
              <EvidenceIcon item={item} />
              <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
                <p className="text-base font-bold leading-6 text-[#001a33]">{copy.name}</p>
                <p className="text-base leading-7 text-[#405267]">{copy.description}</p>
                <p className="text-sm font-semibold text-[#006f72]">
                  {t(`evidence.status.${getStatusKey(item)}`)}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
