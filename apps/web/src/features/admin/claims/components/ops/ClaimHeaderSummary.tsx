import { Link } from '@/i18n/routing';
import { Activity, AlertTriangle, Building2, Clock, UserRound, UserX } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { ClaimOpsDetail } from '../../types';
import { ClaimOriginBadges } from '../shared/ClaimOriginBadges';
import { InfoPill } from '../shared/InfoPill';
import { formatClaimCreatedDate } from './claim-header-date';

interface ClaimHeaderSummaryProps {
  claim: ClaimOpsDetail;
  showAssignee: boolean;
  memberProfileHref: string;
  activeLocale: string;
}

export function ClaimHeaderSummary({
  claim,
  showAssignee,
  memberProfileHref,
  activeLocale,
}: ClaimHeaderSummaryProps) {
  const tCategory = useTranslations('claims.category');
  const tBadge = useTranslations('admin.claims_page.next_actions.risk');
  const tSource = useTranslations('admin.claims_page.source');
  const tLifecycle = useTranslations('admin.claims_page.lifecycle_tabs');
  const tFilters = useTranslations('admin.claims_page.filters');

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap sm:gap-3">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight mr-1">{claim.title}</h1>

          <InfoPill
            label={tCategory(claim.category || 'other')}
            variant="premium"
            className="bg-blue-50 text-blue-700 border-blue-200"
            separatorClassName="bg-blue-200"
          />

          {claim.companyName && (
            <InfoPill
              icon={Building2}
              label={claim.companyName}
              variant="premium"
              className="bg-slate-50 text-slate-700 border-slate-200"
              separatorClassName="bg-slate-200"
            />
          )}

          {claim.assigneeId && (
            <InfoPill
              icon={UserRound}
              label={tFilters('handler_label')}
              value={(showAssignee && claim.ownerName) || tSource('unknown')}
              variant="premium"
              className="bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm"
              separatorClassName="bg-indigo-200"
            />
          )}

          <InfoPill
            icon={Activity}
            label={tBadge('status')}
            value={tLifecycle(claim.lifecycleStage)}
            variant="premium"
            className="bg-slate-50 text-slate-700 border-slate-200"
            separatorClassName="bg-slate-200"
          />

          {claim.hasSlaBreach && (
            <InfoPill
              icon={AlertTriangle}
              label={tBadge('sla')}
              value={tBadge('breach')}
              variant="danger"
            />
          )}

          {claim.isStuck && (
            <InfoPill
              icon={Clock}
              label={tBadge('stuck')}
              value={`${claim.daysInStage} ${tBadge('days')}`}
              variant="warning"
            />
          )}

          {claim.isUnassigned && (
            <InfoPill
              icon={UserX}
              label={tBadge('status')}
              value={tBadge('unassigned')}
              variant="ghost"
            />
          )}
        </div>

        <div className="flex flex-col gap-2 mt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <ClaimOriginBadges
              originType={claim.originType}
              originDisplayName={claim.originDisplayName}
              branchCode={claim.branchCode}
              diasporaCountry={claim.diasporaCountry}
              variant="detail"
            />

            <span className="text-muted-foreground/30 hidden sm:inline">•</span>

            <div className="inline-flex items-center rounded-md border shadow-sm select-none bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 transition-colors h-[22px]">
              <div className="flex items-center gap-1.5 px-2 py-0.5">
                <UserRound className="w-3 h-3" strokeWidth={2.5} />
                <span className="text-[10px] uppercase tracking-wider font-bold">
                  {tSource('member')}
                </span>
              </div>
              <div className="w-[1px] h-3 self-center bg-sky-200" />
              <Link
                href={memberProfileHref}
                className="flex items-center gap-1 px-2 py-0.5 hover:underline decoration-sky-700/50"
              >
                <span className="text-[10px] font-medium max-w-[150px] truncate">
                  {claim.memberName}
                </span>
              </Link>
            </div>
          </div>

          <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium opacity-70 pl-0.5">
            {tSource('created')} {formatClaimCreatedDate(claim.createdAt, activeLocale)}
          </span>
        </div>
      </div>
    </div>
  );
}
