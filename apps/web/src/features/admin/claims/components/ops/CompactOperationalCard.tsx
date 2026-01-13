import { useLocale } from 'next-intl';
import Link from 'next/link';

import { cn } from '@/lib/utils';
import type { ClaimOperationalRow } from '../../types';
import { OwnerDirective } from '../OwnerDirective';
import { StateSpine } from '../StateSpine';
import { ClaimOriginBadges } from '../shared/ClaimOriginBadges';

interface CompactOperationalCardProps {
  claim: ClaimOperationalRow;
  isSelected?: boolean;
}

/**
 * CompactOperationalCard — High density card for Ops Center.
 * Height target: ~86px.
 * Truncates content to fit 5+ cards above fold.
 */
export function CompactOperationalCard({ claim, isSelected }: CompactOperationalCardProps) {
  const locale = useLocale();
  const href = `/${locale}/admin/claims/${claim.id}`;

  return (
    <Link
      href={href}
      className={cn(
        'group relative flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all text-left shadow-sm',
        'hover:bg-accent/40 hover:border-accent-foreground/20 hover:shadow-md',
        isSelected
          ? 'bg-accent/15 border-primary/20 ring-1 ring-inset ring-primary/10 shadow-md'
          : 'bg-white/80 border-slate-200/60'
      )}
      data-testid="claim-operational-card"
    >
      {/* 1. Compact Spine */}
      <div className="shrink-0 mt-0.5">
        <StateSpine
          stage={claim.lifecycleStage}
          daysInStage={claim.daysInStage}
          isStuck={claim.isStuck}
          hasSlaBreach={claim.hasSlaBreach}
          compact
        />
      </div>

      <div className="flex-1 min-w-0 space-y-1">
        {/* 2. Directive (Tight leading, scaled down slightly) */}
        <div className="transform origin-left scale-95 -ml-0.5">
          <OwnerDirective
            ownerRole={claim.ownerRole}
            ownerName={claim.ownerName ?? undefined}
            waitingOn={claim.waitingOn}
            isUnassigned={claim.isUnassigned}
            status={claim.status}
          />
        </div>

        {/* New 2.5: Source Badges (Dense) */}
        <div className="py-0.5">
          <ClaimOriginBadges
            originType={claim.originType}
            originDisplayName={claim.originDisplayName}
            branchCode={claim.branchCode}
            variant="list"
          />
        </div>

        {/* 3. Identity (Truncated) */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-medium tracking-tight text-slate-500 bg-slate-100/80 px-1.5 py-0.5 rounded border border-slate-200/60 shadow-[inset_0_1px_1px_rgba(0,0,0,0.02)]">
            {claim.claimNumber ?? claim.code}
          </span>
          <h3
            className={cn(
              'text-sm font-medium tracking-tight truncate max-w-[180px]',
              isSelected ? 'text-primary font-semibold' : 'text-slate-700'
            )}
          >
            {claim.title}
          </h3>
        </div>

        {/* 4. Minimal Metadata (Member + Category) - Branch moved to badges */}
        <p className="text-[11px] text-muted-foreground truncate font-medium opacity-80 pl-0.5">
          {claim.memberName} • {claim.category}
        </p>
      </div>

      {/* Chevron indicator on hover */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-muted-foreground">→</span>
      </div>
    </Link>
  );
}
