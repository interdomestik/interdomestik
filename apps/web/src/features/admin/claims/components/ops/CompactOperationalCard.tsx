'use client';

import { cn } from '@/lib/utils';
import type { ClaimOperationalRow } from '../../types';
import { OwnerDirective } from '../OwnerDirective';
import { StateSpine } from '../StateSpine';

interface CompactOperationalCardProps {
  claim: ClaimOperationalRow;
  isSelected?: boolean;
  onClick: () => void;
}

/**
 * CompactOperationalCard — High density card for Ops Center.
 * Height target: ~86px.
 * Truncates content to fit 5+ cards above fold.
 */
export function CompactOperationalCard({
  claim,
  isSelected,
  onClick,
}: CompactOperationalCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all',
        'hover:bg-accent/50 hover:border-accent-foreground/20',
        isSelected
          ? 'bg-accent border-accent-foreground/30 ring-1 ring-inset ring-primary/20'
          : 'bg-card/50 border-white/5'
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

        {/* 3. Identity (Truncated) */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground shrink-0">{claim.code}</span>
          <h3 className="text-sm font-medium leading-none truncate" title={claim.title}>
            {claim.title}
          </h3>
        </div>

        {/* 4. Minimal Metadata (One line) */}
        <p className="text-xs text-muted-foreground truncate">
          {claim.memberName} • {claim.category}
          {claim.branchCode && ` • ${claim.branchCode}`}
        </p>
      </div>

      {/* Chevron indicator on hover */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="text-muted-foreground">→</span>
      </div>
    </div>
  );
}
