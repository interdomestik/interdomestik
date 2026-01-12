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

/**
 * ClaimRow — Operational Center layout (v2.4)
 *
 * Visual Hierarchy:
 * 1. STATE SPINE (stage + risk) — dominant, left
 * 2. RESPONSIBILITY (owner + assignee) — directive
 * 3. IDENTITY (code + title) — context
 * 4. METADATA (member, branch) — reference
 */
export function ClaimRow({ claim }: ClaimRowProps) {
  const tCommon = useTranslations('common');
  const tCategory = useTranslations('claims.category');

  const categoryLabel = claim.category
    ? tCategory(claim.category as Parameters<typeof tCategory>[0])
    : tCommon('none');

  return (
    <Card
      className="p-4 bg-background/40 backdrop-blur-sm border-white/5 hover:bg-white/5 transition-colors"
      data-testid={`admin-claim-row-${claim.id}`}
    >
      <div className="flex gap-4">
        {/* LEFT: State Spine (dominant) */}
        <div className="flex-shrink-0 w-32 flex flex-col justify-center gap-2">
          {/* Stage Badge with risk override */}
          <ClaimStageLine
            stage={claim.lifecycleStage}
            daysInStage={claim.daysInStage}
            isStuck={claim.isStuck}
            hasSlaBreach={claim.hasSlaBreach}
          />

          {/* Additional risk indicators (compact) */}
          <ClaimRiskIndicators
            isStuck={claim.isStuck}
            hasSlaBreach={claim.hasSlaBreach}
            isUnassigned={claim.isUnassigned}
            waitingOn={claim.waitingOn}
            hasCashPending={claim.hasCashPending}
            showAdminIndicators={true}
          />
        </div>

        {/* MIDDLE: Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          {/* Row 1: Responsibility (directive) */}
          <ClaimOwnerLine
            ownerRole={claim.ownerRole}
            ownerName={claim.ownerName}
            waitingOn={claim.waitingOn}
            isUnassigned={claim.isUnassigned}
          />

          {/* Row 2: Identity (code + title) */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground/60">{claim.code}</span>
            <h3 className="text-sm font-medium text-foreground truncate">{claim.title}</h3>
          </div>

          {/* Row 3: Context (member, branch, category) — muted */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground/70">
            <span>{claim.memberName}</span>
            <span>•</span>
            <span data-testid={`admin-claim-branch-${claim.id}`}>
              {claim.branchCode ?? tCommon('none')}
            </span>
            <span>•</span>
            <span>{categoryLabel}</span>
          </div>
        </div>

        {/* RIGHT: Actions */}
        <div className="flex-shrink-0 flex items-center">
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
