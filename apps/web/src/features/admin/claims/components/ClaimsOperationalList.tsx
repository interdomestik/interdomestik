import { useTranslations } from 'next-intl';
import type { ClaimOperationalRow } from '../types';
import { ClaimRow } from './ClaimRow';

interface ClaimsOperationalListProps {
  claims: ClaimOperationalRow[];
}

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
        <ClaimRow key={claim.id} claim={claim} />
      ))}
    </div>
  );
}
