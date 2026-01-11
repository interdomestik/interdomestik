import { useTranslations } from 'next-intl';
import type { OwnerRole } from '../types';

interface ClaimOwnerLineProps {
  ownerRole: OwnerRole;
  ownerName: string | null;
}

export function ClaimOwnerLine({ ownerRole, ownerName }: ClaimOwnerLineProps) {
  const tOwner = useTranslations('claims.owner');
  const tTable = useTranslations('admin.claims_page.table.row');

  const roleLabel = tOwner(ownerRole);

  if (ownerRole === 'system') {
    return <div className="text-xs text-muted-foreground">{tTable('owner_system')}</div>;
  }

  if (ownerName) {
    return (
      <div className="text-xs text-muted-foreground">
        {tTable('owner_assigned', { name: ownerName, role: roleLabel })}
      </div>
    );
  }

  return (
    <div className="text-xs text-muted-foreground">
      {tTable('owner_waiting', { owner: roleLabel })}
    </div>
  );
}
