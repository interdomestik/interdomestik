// Phase 2.8: Prioritized List Component
import { useTranslations } from 'next-intl';

import type { ClaimOperationalRow } from '../../types';
import { CompactOperationalCard } from './CompactOperationalCard';

interface PrioritizedListProps {
  claims: ClaimOperationalRow[];
}

/**
 * PrioritizedList — Top 10 claims display (Compact).
 */
export function PrioritizedList({ claims }: PrioritizedListProps) {
  const t = useTranslations('admin.claims_page.ops_center');

  if (claims.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        {t('prioritized_list.empty')}
      </div>
    );
  }

  return (
    <div className="space-y-2 pr-1" data-testid="prioritized-list">
      {claims.map(claim => (
        <CompactOperationalCard key={claim.id} claim={claim} />
      ))}
    </div>
  );
}
