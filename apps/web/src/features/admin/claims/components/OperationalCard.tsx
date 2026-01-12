import { Link } from '@/i18n/routing';
import { Button, Card } from '@interdomestik/ui';
import { Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ClaimOperationalRow } from '../types';
import { ClaimIdentity } from './ClaimIdentity';
import { ClaimMetadata } from './ClaimMetadata';
import { OwnerDirective } from './OwnerDirective';
import { StateSpine } from './StateSpine';

interface OperationalCardProps {
  claim: ClaimOperationalRow;
}

/**
 * OperationalCard — Phase 2.5 claim card layout
 *
 * Visual Hierarchy (per spec):
 * 1. STATE SPINE (left) — stage + risk badges, dominant
 * 2. DIRECTIVE (top of content) — owner instruction
 * 3. IDENTITY (middle) — code + title
 * 4. METADATA (bottom, muted) — member, branch, category, amount
 * 5. ACTION (right) — View button with 44x44px target
 *
 * Consumes only fields from ClaimOperationalRow (no DTO changes).
 * Derives display strings in UI using translations.
 */
export function OperationalCard({ claim }: OperationalCardProps) {
  const t = useTranslations('admin.claims_page.operational_card');

  return (
    <Card
      className="p-4 bg-background/40 backdrop-blur-sm border-white/5 hover:bg-white/5 transition-colors"
      data-testid="claim-operational-card"
    >
      <div className="flex gap-4">
        {/* LEFT: State Spine (dominant) */}
        <div className="flex-shrink-0">
          <StateSpine
            stage={claim.lifecycleStage}
            daysInStage={claim.daysInStage}
            isStuck={claim.isStuck}
            hasSlaBreach={claim.hasSlaBreach}
          />
        </div>

        {/* MIDDLE: Content */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
          {/* Row 1: Owner Directive */}
          <OwnerDirective
            ownerRole={claim.ownerRole}
            ownerName={claim.ownerName ?? undefined}
            waitingOn={claim.waitingOn}
            isUnassigned={claim.isUnassigned}
            status={claim.status}
          />

          {/* Row 2: Identity (code + title) */}
          <ClaimIdentity code={claim.code} title={claim.title} />

          {/* Row 3: Metadata (muted) */}
          <ClaimMetadata
            memberName={claim.memberName}
            branchCode={claim.branchCode}
            category={claim.category}
          />
        </div>

        {/* RIGHT: Action (44x44px touch target per spec) */}
        <div className="flex-shrink-0 flex items-center">
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="min-w-[44px] min-h-[44px] hover:bg-white/10 hover:text-emerald-400"
            data-testid="view-claim"
          >
            <Link href={`/admin/claims/${claim.id}`} aria-label={t('view_claim')}>
              <Eye className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">{t('view_claim')}</span>
            </Link>
          </Button>
        </div>
      </div>
    </Card>
  );
}
