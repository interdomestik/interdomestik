'use client';

import { format } from 'date-fns';
import { enUS, sq } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  ChevronRight,
  Clock,
  Copy,
  Link as LinkIcon,
  UserRound,
  UserX,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';

import type { NextActionsResult } from '../../components/detail/getNextActions';
import type { ClaimOpsDetail } from '../../types';
import { ClaimOriginBadges } from '../shared/ClaimOriginBadges';
import { InfoPill } from '../shared/InfoPill';

interface ClaimHeaderProps {
  claim: ClaimOpsDetail;
  nextActions: NextActionsResult;
  allStaff: { id: string; name: string | null; email: string }[];
  locale: string;
}

export function ClaimHeader({ claim, allStaff, locale }: Omit<ClaimHeaderProps, 'nextActions'>) {
  const tCategory = useTranslations('claims.category');
  const tBadge = useTranslations('admin.claims_page.next_actions.risk');
  const tSource = useTranslations('admin.claims_page.source');
  const tLifecycle = useTranslations('admin.claims_page.lifecycle_tabs');
  const tFilters = useTranslations('admin.claims_page.filters');
  const searchParams = useSearchParams();

  // Construct smart back URL: preserve filters/page, but drop poolAnchor to force refresh
  const createBackUrl = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('poolAnchor');
    const queryString = params.toString();
    return queryString ? `/admin/claims?${queryString}` : '/admin/claims';
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const domain = typeof window !== 'undefined' ? window.location.origin : '';
  const canonicalUrl = `${domain}/${locale}/admin/claims/${claim.id}`;
  const resolverUrl = claim.claimNumber
    ? `${domain}/${locale}/admin/claims/number/${claim.claimNumber}`
    : canonicalUrl;

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

          <div className="flex items-center gap-2 group">
            <span className="font-mono font-medium text-foreground bg-slate-100 px-1.5 py-0.5 rounded text-xs border border-slate-200">
              {claim.claimNumber ?? claim.code}
            </span>

            {/* Copy Actions (Hover only) */}
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              <button
                onClick={() => copyToClipboard(resolverUrl, 'Claim Number Link')}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                title="Copy Traceable Number Link"
              >
                <LinkIcon className="w-3 h-3" />
              </button>
              <button
                onClick={() => copyToClipboard(canonicalUrl, 'Canonical URL')}
                className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-600"
                title="Copy Canonical System Link"
              >
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
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

              {/* Insurer Company Name */}
              {claim.companyName && (
                <InfoPill
                  icon={Building2}
                  label={claim.companyName}
                  variant="premium"
                  className="bg-slate-50 text-slate-700 border-slate-200"
                  separatorClassName="bg-slate-200"
                />
              )}

              {/* Assignee Badge (Static) */}
              {claim.assigneeId && (
                <InfoPill
                  icon={UserRound}
                  label={tFilters('handler_label')}
                  value={(() => {
                    const staff = allStaff.find(s => s.id === claim.assigneeId);
                    return staff?.name || staff?.email || tSource('unknown');
                  })()}
                  variant="premium"
                  className="bg-indigo-50 text-indigo-700 border-indigo-200 shadow-sm"
                  separatorClassName="bg-indigo-200"
                />
              )}

              {/* Lifecycle Stage Badge (Static) */}
              <InfoPill
                icon={Activity}
                label={tBadge('status')}
                value={tLifecycle(claim.lifecycleStage)}
                variant="premium"
                className="bg-slate-50 text-slate-700 border-slate-200"
                separatorClassName="bg-slate-200"
              />

              {/* Risk Indicators (SLA/Stuck) */}
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

            {/* Source Strip Row */}
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
                <div className="inline-flex items-center rounded-md border shadow-sm select-none bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100 transition-colors h-[22px]">
                  <div className="flex items-center gap-1.5 px-2 py-0.5">
                    <UserRound className="w-3 h-3" strokeWidth={2.5} />
                    <span className="text-[10px] uppercase tracking-wider font-bold">
                      {tSource('member')}
                    </span>
                  </div>
                  <div className="w-[1px] h-3 self-center bg-sky-200" />
                  <Link
                    href={`/${locale}/admin/users/${claim.memberId}`}
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
        </div>
      </div>
    </div>
  );
}
