import { ShieldCheck } from 'lucide-react';

import type { FreeStartCopy } from './types';

export function TrustBoundary({ t }: { t: FreeStartCopy }) {
  return (
    <div
      data-testid="free-start-trust-boundary"
      className="flex items-start gap-3 border-t border-[#001a33]/15 pt-5 text-[#33485c]"
    >
      <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#008f91]" />
      <div className="space-y-1">
        <p className="text-sm font-bold text-[#001a33]">{t('trustBoundary.heading')}</p>
        <p className="text-sm leading-6">{t('trustBoundary.body')}</p>
      </div>
    </div>
  );
}
