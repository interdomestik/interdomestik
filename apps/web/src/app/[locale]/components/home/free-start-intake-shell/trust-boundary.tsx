import { ShieldCheck } from 'lucide-react';

import type { FreeStartCopy } from './types';

/**
 * The permanent service limit, stated once and briefly.
 *
 * The long temporary-result and storage explanation is not repeated here while facts are entered:
 * it belongs with the optional summary action that generates that result, and with the result
 * itself. Hiding the service limit entirely is not an option, so this short line always shows.
 */
export function TrustBoundary({ t }: { t: FreeStartCopy }) {
  return (
    <div
      data-testid="free-start-trust-boundary"
      className="flex items-start gap-3 border-t border-[#001a33]/15 pt-5 text-[#33485c]"
    >
      <ShieldCheck aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-[#008f91]" />
      <div className="space-y-1">
        <p className="text-sm font-bold text-[#001a33]">{t('trustBoundary.heading')}</p>
        <p className="text-sm leading-6">{t('trustBoundary.short')}</p>
      </div>
    </div>
  );
}
