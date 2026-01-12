import { useTranslations } from 'next-intl';
import type { ClaimOperationalRow } from '../types';
import { OperationalCard } from './OperationalCard';

interface ClaimsOperationalListProps {
  claims: ClaimOperationalRow[];
}

/**
 * ClaimsOperationalList — Renders list of OperationalCards (Phase 2.5)
 */
export function ClaimsOperationalList({ claims }: ClaimsOperationalListProps) {
  const tTable = useTranslations('admin.claims_page.table');

  if (claims.length === 0) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        {tTable('empty_state')}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {claims.map(claim => (
        <OperationalCard key={claim.id} claim={claim} />
      ))}
    </div>
  );
}
