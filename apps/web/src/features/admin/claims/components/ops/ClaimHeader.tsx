'use client';

import { format } from 'date-fns';
import { enUS, sq } from 'date-fns/locale';
import { AlertTriangle, ArrowLeft, ChevronRight, Clock, UserRound, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { NextActionsResult } from '../../components/detail/getNextActions';
import type { ClaimOpsDetail } from '../../types';
import { ClaimOriginBadges } from '../shared/ClaimOriginBadges';
import { InfoPill } from '../shared/InfoPill';
import { OpsAssignmentControl } from './OpsAssignmentControl';
import { OpsStatusControl } from './OpsStatusControl';

interface ClaimHeaderProps {
  claim: ClaimOpsDetail;
  nextActions: NextActionsResult;
  allStaff: { id: string; name: string | null; email: string }[];
  locale: string;
}

export function ClaimHeader({ claim, nextActions, allStaff, locale }: ClaimHeaderProps) {
  const tCategory = useTranslations('claims.category');
  const tBadge = useTranslations('admin.claims_page.next_actions.risk');
  const tSource = useTranslations('admin.claims_page.source');
  const searchParams = useSearchParams();

  // Construct smart back URL: preserve filters/page, but drop poolAnchor to force refresh
  const createBackUrl = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('poolAnchor');
    const queryString = params.toString();
    return queryString ? `/admin/claims?${queryString}` : '/admin/claims';
  };

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b pb-4 pt-2 -mx-4 px-4 sm:-mx-8 sm:px-8 mb-6 transition-all">
      <div className="flex flex-col gap-4">
        {/* Breadcrumbs / Top Line */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link
            href={createBackUrl()}
            className="hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            {tBadge('back_to_queue')}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 opacity-50" />
          <span className="font-medium text-foreground">{claim.code}</span>
          {claim.branchCode && (
            <>
              <ChevronRight className="w-3.5 h-3.5 opacity-50" />
              <span>{claim.branchCode}</span>
            </>
          )}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Title Section */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap sm:gap-3">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight mr-1">{claim.title}</h1>

              {/* Category Pill */}
              <InfoPill
                label={tCategory(claim.category || 'other')}
                variant="premium"
                className="bg-blue-50 text-blue-700 border-blue-200"
                separatorClassName="bg-blue-200"
              />

              {/* SLA Breach */}
              {claim.hasSlaBreach && (
                <InfoPill
                  icon={AlertTriangle}
                  label={tBadge('sla')}
                  value={tBadge('breach')}
                  variant="danger"
                />
              )}

              {/* Stuck Claim */}
              {claim.isStuck && (
                <InfoPill
                  icon={Clock}
                  label={tBadge('stuck')}
                  value={`${claim.daysInStage} ${tBadge('days')}`}
                  variant="warning"
                />
              )}

              {/* Unassigned */}
              {claim.isUnassigned && (
                <InfoPill
                  icon={UserX}
                  label={tBadge('status')}
                  value={tBadge('unassigned')}
                  variant="ghost"
                />
              )}
            </div>
            {/* Source Strip Row - Replaced with ClaimOriginBadges */}
            <div className="flex flex-col gap-2 mt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <ClaimOriginBadges
                  originType={claim.originType}
                  originDisplayName={claim.originDisplayName}
                  branchCode={claim.branchCode}
                  variant="detail"
                />

                <span className="text-muted-foreground/30 hidden sm:inline">•</span>

                {/* Member Premium Pill */}
                <div className="inline-flex items-center rounded-md border shadow-sm select-none bg-white bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 transition-colors h-[22px]">
                  <div className="flex items-center gap-1.5 px-2 py-0.5">
                    <UserRound className="w-3 h-3" strokeWidth={2.5} />
                    <span className="text-[10px] uppercase tracking-wider font-bold">
                      {tSource('member')}
                    </span>
                  </div>
                  <div className="w-[1px] h-3 self-center bg-sky-200" />
                  <Link
                    href={`/${locale}/admin/users/${claim.userId}`}
                    className="flex items-center gap-1 px-2 py-0.5 hover:underline decoration-sky-700/50"
                  >
                    <span className="text-[10px] font-medium max-w-[150px] truncate">
                      {claim.memberName}
                    </span>
                  </Link>
                </div>
              </div>

              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium opacity-70 pl-0.5">
                {tSource('created')}{' '}
                {claim.createdAt
                  ? format(new Date(claim.createdAt), 'MMMM d, yyyy', {
                      locale: locale === 'sq' ? sq : enUS,
                    })
                  : ''}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-3">
            {/* Assignment Control - Conditionally Shown */}
            {nextActions.showAssignment && (
              <div className="w-[200px]">
                <OpsAssignmentControl
                  claimId={claim.id}
                  currentStaffId={claim.assigneeId}
                  staff={allStaff}
                  locale={locale}
                />
              </div>
            )}

            {/* Status Control - Always Shown but filtered */}
            <div className="w-[180px]">
              <OpsStatusControl
                claimId={claim.id}
                currentStatus={claim.status}
                allowedTransitions={nextActions.allowedTransitions}
                locale={locale}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
