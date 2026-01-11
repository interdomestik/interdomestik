import { Link } from '@/i18n/routing';
import { Button, Card } from '@interdomestik/ui';
import { Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ClaimOperationalRow } from '../types';
import { ClaimOwnerLine } from './ClaimOwnerLine';
import { ClaimRiskIndicators } from './ClaimRiskIndicators';
import { ClaimStageLine } from './ClaimStageLine';

interface ClaimRowProps {
  claim: ClaimOperationalRow;
}

export function ClaimRow({ claim }: ClaimRowProps) {
  const t = useTranslations('admin.claims_page.table.row');
  const tCommon = useTranslations('common');
  const tCategory = useTranslations('claims.category');

  const categoryLabel = claim.category ? tCategory(claim.category as any) : tCommon('none');

  return (
    <Card
      className="p-4 bg-background/40 backdrop-blur-sm border-white/5 hover:bg-white/5 transition-colors"
      data-testid={`admin-claim-row-${claim.id}`}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left: Main content */}
        <div className="flex-1 min-w-0 space-y-1.5">
          {/* Title + Code */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">{claim.code}</span>
            <h3 className="text-sm font-medium text-foreground truncate">{claim.title}</h3>
          </div>

          {/* Stage Line */}
          <ClaimStageLine stage={claim.lifecycleStage} daysInStage={claim.daysInStage} />

          {/* Owner Line */}
          <ClaimOwnerLine ownerRole={claim.ownerRole} ownerName={claim.ownerName} />

          {/* Meta: Branch + Category */}
          <div
            className="text-xs text-muted-foreground"
            data-testid={`admin-claim-branch-${claim.id}`}
          >
            {t('branch_type', {
              branch: claim.branchCode ?? tCommon('none'),
              type: categoryLabel,
            })}
          </div>

          {/* Member info */}
          <div className="text-xs text-muted-foreground">
            {t('member', { name: claim.memberName, email: claim.memberEmail })}
          </div>

          {/* Risk Indicators */}
          <ClaimRiskIndicators
            isStuck={claim.isStuck}
            hasSlaBreach={claim.hasSlaBreach}
            hasCashPending={claim.hasCashPending}
          />
        </div>

        {/* Right: Actions */}
        <div className="flex-shrink-0">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-white/10 hover:text-emerald-400"
          >
            <Link href={`/admin/claims/${claim.id}`}>
              <Eye className="h-4 w-4" />
              <span className="sr-only">{tCommon('view')}</span>
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
