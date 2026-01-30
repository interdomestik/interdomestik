'use client';

import { format } from 'date-fns';
import { enUS, sq } from 'date-fns/locale';
import {
  Activity,
  AlertTriangle,
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
  const tPage = useTranslations('admin.claims_page');
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
        {/* Breadcrumb Navigation */}
        <nav className="flex items-center gap-1.5 text-sm" aria-label="Breadcrumb">
          {/* Level 1: Claims List */}
          <Link
            href={createBackUrl()}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {tPage('title')}
          </Link>

          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />

          {/* Level 2: Lifecycle Stage */}
          <Link
            href={`/admin/claims?lifecycle=${claim.lifecycleStage}`}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {tLifecycle(claim.lifecycleStage)}
          </Link>

          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />

          {/* Level 3: Current Claim (Active) */}
          <div className="flex items-center gap-1 group/claim">
            <span
              data-testid="claim-number"
              className="font-mono font-medium text-foreground bg-slate-100 px-1.5 py-0.5 rounded text-xs border border-slate-200"
            >
              {claim.claimNumber ?? claim.code}
            </span>

            {/* Copy Actions (Hover only) */}
            <div className="opacity-0 group-hover/claim:opacity-100 transition-opacity flex items-center gap-1">
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

          {/* Global Member Number Badge */}
          {claim.memberNumber && (
            <div className="flex items-center gap-1 group/member ml-2 border-l pl-2 border-slate-200">
              <span
                className="font-mono font-medium text-amber-900 bg-amber-50 px-1.5 py-0.5 rounded text-xs border border-amber-200"
                title={tPage('member_number')}
              >
                {claim.memberNumber}
              </span>

              <div className="opacity-0 group-hover/member:opacity-100 transition-opacity flex items-center gap-1">
                <button
                  onClick={() => copyToClipboard(claim.memberNumber!, tPage('copy_member_number'))}
                  className="p-1 hover:bg-amber-100 rounded text-amber-600/70 hover:text-amber-700"
                  title={tPage('copy_member_number')}
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button
                  onClick={() =>
                    copyToClipboard(
                      `${domain}/${locale}/admin/members/number/${claim.memberNumber}`,
                      tPage('copy_member_link')
                    )
                  }
                  className="p-1 hover:bg-amber-100 rounded text-amber-600/70 hover:text-amber-700"
                  title={tPage('copy_member_link')}
                >
                  <LinkIcon className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </nav>

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
