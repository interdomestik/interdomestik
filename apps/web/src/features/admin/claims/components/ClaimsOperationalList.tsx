'use client';

import { Button } from '@interdomestik/ui';
import { Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { OPS_TEST_IDS, OpsQueryState, OpsTable } from '@/components/ops';
import { Link, useRouter } from '@/i18n/routing';

import type { ClaimOperationalRow } from '../types';
import { ClaimIdentity } from './ClaimIdentity';
import { ClaimMetadata } from './ClaimMetadata';
import { OwnerDirective } from './OwnerDirective';
import { StateSpine } from './StateSpine';

interface ClaimsOperationalListProps {
  claims: ClaimOperationalRow[];
  loading?: boolean;
  error?: boolean;
}

/**
 * ClaimsOperationalList — Renders list of OperationalCards (Phase 2.5)
 */
export function ClaimsOperationalList({ claims, loading, error }: ClaimsOperationalListProps) {
  const router = useRouter();
  const tTable = useTranslations('admin.claims_page.table');
  const tCard = useTranslations('admin.claims_page.operational_card');

  const columns = [
    { key: 'status', header: tTable('headers.status'), className: 'w-[140px]' },
    { key: 'claim', header: tTable('headers.title') },
  ];

  const rows = claims.map(claim => ({
    id: claim.id,
    testId: 'claim-operational-card',
    dataAttributes: {
      'data-title': claim.title || '',
    },
    onClick: () => router.push(`/admin/claims/${claim.id}`),
    cells: [
      <div key={`${claim.id}-spine`} className="py-2 pl-4">
        <StateSpine
          stage={claim.lifecycleStage}
          daysInStage={claim.daysInStage}
          isStuck={claim.isStuck}
          hasSlaBreach={claim.hasSlaBreach}
        />
      </div>,
      <div key={`${claim.id}-summary`} className="space-y-1 py-2">
        <OwnerDirective
          ownerRole={claim.ownerRole}
          ownerName={claim.ownerName ?? undefined}
          waitingOn={claim.waitingOn}
          isUnassigned={claim.isUnassigned}
          status={claim.status}
        />
        <ClaimIdentity code={claim.code} title={claim.title} memberNumber={claim.memberNumber} />
        <ClaimMetadata
          memberName={claim.memberName}
          memberNumber={claim.memberNumber}
          branchCode={claim.branchCode}
          category={claim.category}
        />
      </div>,
    ],
    actions: (
      <Button
        asChild
        variant="ghost"
        size="icon"
        className="min-w-[44px] min-h-[44px] hover:bg-white/10 hover:text-emerald-400"
        data-testid="view-claim"
        title={tCard('view_claim')}
      >
        <Link href={`/admin/claims/${claim.id}`} aria-label={tCard('view_claim')}>
          <Eye className="h-5 w-5" aria-hidden="true" />
          <span className="sr-only">{tCard('view_claim')}</span>
        </Link>
      </Button>
    ),
  }));

  return (
    <OpsQueryState
      loading={loading}
      error={error}
      isEmpty={claims.length === 0}
      emptyTitle={tTable('empty_state')}
      emptyTestId={OPS_TEST_IDS.TABLE.EMPTY}
    >
      <OpsTable
        columns={columns}
        rows={rows}
        emptyLabel={tTable('empty_state')}
        actionsHeader={tTable('headers.actions')}
        rowTestId="claim-operational-card"
      />
    </OpsQueryState>
  );
}
