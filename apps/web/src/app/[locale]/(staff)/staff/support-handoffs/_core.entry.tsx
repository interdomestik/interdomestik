import {
  acceptSupportHandoff,
  closeSupportHandoff,
  reassignSupportHandoff,
} from '@/actions/support-handoffs/lifecycle';
import { getSessionSafe, requireSessionOrRedirect } from '@/components/shell/session';
import { Link } from '@/i18n/routing';
import { resolveStaffSupportSessionBranch } from '@/lib/support-handoffs/staff-session';
import { and, db, eq, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import {
  getStaffSupportHandoffQueue,
  type SupportHandoffClaimLinkFilter,
} from '@interdomestik/domain-claims/support-handoffs/queue';
import type {
  SupportHandoffQueueAssignmentFilter,
  SupportHandoffQueueAttentionFilter,
  SupportHandoffStatus,
  SupportHandoffUrgency,
} from '@interdomestik/domain-claims/support-handoffs/types';
import { Button } from '@interdomestik/ui';
import { MessageSquareText } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { SupportHandoffAttentionRow } from './support-handoff-attention-row';
import { SupportHandoffDetailPanel } from './support-handoff-detail-panel';

export { generateMetadata, generateViewport } from '@/app/_segment-exports';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type SearchParamValue = string | string[] | undefined;

const STATUS_FILTERS = ['all', 'open', 'accepted', 'closed'] as const;
const URGENCY_FILTERS = ['all', 'critical', 'high', 'normal', 'low'] as const;
const CLAIM_LINK_FILTERS = ['all', 'linked', 'unlinked'] as const;
const ATTENTION_FILTERS = ['all', 'needs_follow_up'] as const;

function getSingleParam(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function isOneOf<T extends readonly string[]>(
  values: T,
  value: string | undefined
): value is T[number] {
  return !!value && values.includes(value);
}

function parseAssignmentFilter(
  value: SearchParamValue,
  role: string | null | undefined
): SupportHandoffQueueAssignmentFilter {
  const filter = getSingleParam(value);
  if (filter === 'unassigned') return 'unassigned';
  if (filter === 'mine' && role === 'staff') return 'mine';
  return 'all';
}

function parseStatusFilter(
  value: SearchParamValue,
  attention: SupportHandoffQueueAttentionFilter
): SupportHandoffStatus | 'all' {
  const filter = getSingleParam(value);
  if (isOneOf(STATUS_FILTERS, filter)) return filter;
  return attention === 'needs_follow_up' ? 'accepted' : 'open';
}

function parseUrgencyFilter(value: SearchParamValue): SupportHandoffUrgency | 'all' {
  const filter = getSingleParam(value);
  return isOneOf(URGENCY_FILTERS, filter) ? filter : 'all';
}

function parseClaimLinkFilter(value: SearchParamValue): SupportHandoffClaimLinkFilter {
  const filter = getSingleParam(value);
  return isOneOf(CLAIM_LINK_FILTERS, filter) ? filter : 'all';
}

function parseAttentionFilter(value: SearchParamValue): SupportHandoffQueueAttentionFilter {
  const filter = getSingleParam(value);
  return isOneOf(ATTENTION_FILTERS, filter) ? filter : 'all';
}

function parseSearchTerm(value: SearchParamValue) {
  const normalized = getSingleParam(value)?.trim().replace(/\s+/g, ' ').slice(0, 80);
  return normalized || undefined;
}

function buildSupportHandoffsHref(args: {
  assigned: SupportHandoffQueueAssignmentFilter;
  attention: SupportHandoffQueueAttentionFilter;
  claim: SupportHandoffClaimLinkFilter;
  search?: string;
  status: SupportHandoffStatus | 'all';
  urgency: SupportHandoffUrgency | 'all';
}) {
  const params = new URLSearchParams();
  if (args.assigned !== 'all') params.set('assigned', args.assigned);
  if (args.attention !== 'all') params.set('attention', args.attention);
  if (args.status !== 'open') params.set('status', args.status);
  if (args.urgency !== 'all') params.set('urgency', args.urgency);
  if (args.claim !== 'all') params.set('claim', args.claim);
  if (args.search) params.set('search', args.search);
  const query = params.toString();
  return query ? `/staff/support-handoffs?${query}` : '/staff/support-handoffs';
}

async function getAssignableStaff(args: { branchId: string | null; tenantId: string }) {
  return db.query.user.findMany({
    where: withTenant(
      args.tenantId,
      user.tenantId,
      args.branchId
        ? and(eq(user.role, 'staff'), eq(user.branchId, args.branchId))
        : eq(user.role, 'staff')
    ),
    columns: {
      id: true,
      name: true,
      email: true,
      role: true,
    },
  });
}

function getFilterOptions<T extends string>(args: {
  current: T;
  labels: Record<T, string>;
  values: readonly T[];
  toHref: (value: T) => string;
  testPrefix: string;
}) {
  return args.values.map(value => ({
    href: args.toHref(value),
    isActive: args.current === value,
    label: args.labels[value],
    testId: `${args.testPrefix}-${value}`,
    value,
  }));
}

export default async function StaffSupportHandoffsPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('agent-claims.claims.support_handoffs');

  const session = requireSessionOrRedirect(
    await getSessionSafe('StaffSupportHandoffsPage'),
    locale
  );
  const staffSession = await resolveStaffSupportSessionBranch(session);
  if (!staffSession) {
    return notFound();
  }

  const resolvedSearchParams = await searchParams;
  const currentAssignment = parseAssignmentFilter(
    resolvedSearchParams.assigned,
    staffSession.user.role
  );
  const currentUrgency = parseUrgencyFilter(resolvedSearchParams.urgency);
  const currentClaim = parseClaimLinkFilter(resolvedSearchParams.claim);
  const currentAttention = parseAttentionFilter(resolvedSearchParams.attention);
  const currentStatus = parseStatusFilter(resolvedSearchParams.status, currentAttention);
  const currentSearch = parseSearchTerm(resolvedSearchParams.search);
  const queue = await getStaffSupportHandoffQueue({
    assignment: currentAssignment,
    attention: currentAttention,
    branchId: staffSession.user.branchId,
    claimLink: currentClaim,
    limit: 30,
    search: currentSearch,
    staffId: staffSession.user.id,
    status: currentStatus,
    tenantId: staffSession.user.tenantId,
    urgency: currentUrgency,
    viewerRole: staffSession.user.role,
  });
  const hasAcceptedHandoffs = queue.some(handoff => handoff.status === 'accepted');
  const staffOptions =
    staffSession.user.role === 'staff' && hasAcceptedHandoffs
      ? await getAssignableStaff({
          branchId: staffSession.user.branchId,
          tenantId: staffSession.user.tenantId,
        })
      : [];

  const assignmentLabels = {
    all:
      staffSession.user.role === 'branch_manager'
        ? t('filters.assignment.all_branch')
        : t('filters.assignment.all_staff'),
    mine: t('filters.assignment.mine'),
    unassigned: t('filters.assignment.unassigned'),
  };
  const statusLabels = {
    all: t('filters.status.all'),
    open: t('status.open'),
    accepted: t('status.accepted'),
    closed: t('status.closed'),
  };
  const urgencyLabels = {
    all: t('filters.urgency.all'),
    critical: t('urgency.critical'),
    high: t('urgency.high'),
    normal: t('urgency.normal'),
    low: t('urgency.low'),
  };
  const claimLabels = {
    all: t('filters.claim.all'),
    linked: t('filters.claim.linked'),
    unlinked: t('filters.claim.unlinked'),
  };
  const attentionLabels = {
    all: t('filters.attention.all'),
    needs_follow_up: t('filters.attention.needs_follow_up'),
  };
  const assignmentValues =
    staffSession.user.role === 'staff'
      ? (['all', 'mine', 'unassigned'] as const)
      : (['all', 'unassigned'] as const);
  const assignmentOptions = getFilterOptions({
    current: currentAssignment,
    labels: assignmentLabels,
    values: assignmentValues,
    testPrefix: 'staff-support-handoffs-assigned-filter',
    toHref: assigned =>
      buildSupportHandoffsHref({
        assigned,
        attention: currentAttention,
        claim: currentClaim,
        search: currentSearch,
        status: currentStatus,
        urgency: currentUrgency,
      }),
  });
  const statusOptions = getFilterOptions({
    current: currentStatus,
    labels: statusLabels,
    values: STATUS_FILTERS,
    testPrefix: 'staff-support-handoffs-status-filter',
    toHref: status =>
      buildSupportHandoffsHref({
        assigned: currentAssignment,
        attention: currentAttention,
        claim: currentClaim,
        search: currentSearch,
        status,
        urgency: currentUrgency,
      }),
  });
  const urgencyOptions = getFilterOptions({
    current: currentUrgency,
    labels: urgencyLabels,
    values: URGENCY_FILTERS,
    testPrefix: 'staff-support-handoffs-urgency-filter',
    toHref: urgency =>
      buildSupportHandoffsHref({
        assigned: currentAssignment,
        attention: currentAttention,
        claim: currentClaim,
        search: currentSearch,
        status: currentStatus,
        urgency,
      }),
  });
  const claimOptions = getFilterOptions({
    current: currentClaim,
    labels: claimLabels,
    values: CLAIM_LINK_FILTERS,
    testPrefix: 'staff-support-handoffs-claim-filter',
    toHref: claim =>
      buildSupportHandoffsHref({
        assigned: currentAssignment,
        attention: currentAttention,
        claim,
        search: currentSearch,
        status: currentStatus,
        urgency: currentUrgency,
      }),
  });
  const attentionOptions = getFilterOptions({
    current: currentAttention,
    labels: attentionLabels,
    values: ATTENTION_FILTERS,
    testPrefix: 'staff-support-handoffs-attention-filter',
    toHref: attention =>
      buildSupportHandoffsHref({
        assigned: currentAssignment,
        attention,
        claim: currentClaim,
        search: currentSearch,
        status: currentStatus,
        urgency: currentUrgency,
      }),
  });
  const hiddenFields: Array<{ name: string; value: string }> = [];
  if (currentAssignment !== 'all')
    hiddenFields.push({ name: 'assigned', value: currentAssignment });
  if (currentAttention !== 'all') hiddenFields.push({ name: 'attention', value: currentAttention });
  if (currentStatus !== 'open') hiddenFields.push({ name: 'status', value: currentStatus });
  if (currentUrgency !== 'all') hiddenFields.push({ name: 'urgency', value: currentUrgency });
  if (currentClaim !== 'all') hiddenFields.push({ name: 'claim', value: currentClaim });
  const detailLabels = {
    collapse: t('detail.collapse'),
    contactPreference: t('detail.contact_preference'),
    contactPreferenceEmail: t('detail.contact_preference_email'),
    contactPreferencePhone: t('detail.contact_preference_phone'),
    contactPreferenceStaffReply: t('detail.contact_preference_staff_reply'),
    contactPreferenceWhatsapp: t('detail.contact_preference_whatsapp'),
    expand: t('detail.expand'),
    fullMessage: t('detail.full_message'),
    lifecycle: t('detail.lifecycle'),
    lifecycleAccepted: t('detail.lifecycle_accepted'),
    lifecycleClosed: t('detail.lifecycle_closed'),
    lifecycleCreated: t('detail.lifecycle_created'),
    lifecyclePending: t('detail.lifecycle_pending'),
    lifecycleReassigned: t('detail.lifecycle_reassigned'),
    lifecycleReason: t('detail.lifecycle_reason'),
    loading: t('detail.loading'),
    memberReplyAt: t('detail.member_reply_at', { date: '{date}' }),
    memberReplyEmpty: t('detail.member_reply_empty'),
    memberReplyTitle: t('detail.member_reply_title'),
    memberReplyWarning: t('detail.member_reply_warning'),
    publicResponseEmpty: t('detail.public_response_empty'),
    publicResponseAcknowledgedAt: t('detail.public_response_acknowledged_at', {
      date: '{date}',
    }),
    publicResponseAwaitingAcknowledgement: t('detail.public_response_awaiting_acknowledgement'),
    publicResponseLabel: t('detail.public_response_label'),
    publicResponsePlaceholder: t('detail.public_response_placeholder'),
    publicResponseReadonly: t('detail.public_response_readonly'),
    publicResponseSubmit: t('detail.public_response_submit'),
    publicResponseTitle: t('detail.public_response_title'),
    publicResponseUpdate: t('detail.public_response_update'),
    source: t('detail.source'),
    sourceClaimDetail: t('detail.source_claim_detail'),
    sourceMemberHelp: t('detail.source_member_help'),
    sourceUnknown: t('detail.source_unknown'),
    unavailable: t('detail.unavailable'),
  };

  return (
    <div className="space-y-6" data-testid="staff-page-ready">
      <div>
        <h1 className="text-3xl font-bold tracking-tight" data-testid="page-title">
          {t('title')}
        </h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
        {staffSession.user.role === 'branch_manager' ? (
          <p
            className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
            data-testid="staff-support-handoffs-readonly-notice"
          >
            {t('branch_manager_readonly')}
          </p>
        ) : null}
      </div>

      <div
        className="rounded-lg border bg-white p-4 shadow-sm"
        data-testid="staff-support-handoffs-filters"
      >
        <form
          action={`/${locale}/staff/support-handoffs`}
          className="flex flex-col gap-3 md:flex-row"
          data-testid="staff-support-handoffs-search-form"
        >
          {hiddenFields.map(field => (
            <input key={field.name} type="hidden" name={field.name} value={field.value} />
          ))}
          <input
            className="h-10 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            name="search"
            defaultValue={currentSearch ?? ''}
            placeholder={t('filters.search_placeholder')}
            data-testid="staff-support-handoffs-search-input"
          />
          <Button
            type="submit"
            variant="outline"
            data-testid="staff-support-handoffs-search-submit"
          >
            {t('filters.search')}
          </Button>
        </form>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {[
            {
              label: t('filters.assignment.label'),
              options: assignmentOptions,
              testId: 'staff-support-handoffs-assignment-filters',
            },
            {
              label: t('filters.status.label'),
              options: statusOptions,
              testId: 'staff-support-handoffs-status-filters',
            },
            {
              label: t('filters.urgency.label'),
              options: urgencyOptions,
              testId: 'staff-support-handoffs-urgency-filters',
            },
            {
              label: t('filters.claim.label'),
              options: claimOptions,
              testId: 'staff-support-handoffs-claim-filters',
            },
            {
              label: t('filters.attention.label'),
              options: attentionOptions,
              testId: 'staff-support-handoffs-attention-filters',
            },
          ].map(group => (
            <div key={group.testId} className="space-y-2" data-testid={group.testId}>
              <p className="text-xs font-semibold uppercase text-muted-foreground">{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {group.options.map(option => (
                  <Button
                    key={option.value}
                    asChild
                    size="sm"
                    variant={option.isActive ? 'default' : 'outline'}
                    data-testid={option.testId}
                  >
                    <Link href={option.href}>{option.label}</Link>
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="rounded-lg border bg-white shadow-sm"
        data-testid="staff-support-handoffs-queue"
      >
        <div className="grid grid-cols-1 gap-4 border-b px-4 py-3 text-sm font-medium text-muted-foreground md:grid-cols-6">
          <span>{t('table.request')}</span>
          <span>{t('table.member')}</span>
          <span>{t('table.relationship')}</span>
          <span>{t('table.risk')}</span>
          <span>{t('table.owner')}</span>
          <span className="text-right">{t('table.actions')}</span>
        </div>
        <div className="divide-y" data-testid="staff-support-handoffs-list">
          {queue.map(handoff => (
            <SupportHandoffAttentionRow
              key={handoff.id}
              handoffId={handoff.id}
              isAttentionQueue={currentAttention === 'needs_follow_up'}
            >
              <div>
                <div
                  className="font-medium text-slate-900"
                  data-testid="staff-support-handoff-subject"
                >
                  {handoff.subject}
                </div>
                <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                  {handoff.message}
                </div>
                {handoff.publicResponseAt ? (
                  <div
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-900"
                    data-testid="staff-support-handoff-public-response-badge"
                  >
                    <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('table.public_response_sent')}</span>
                  </div>
                ) : null}
                {handoff.needsFollowUp ? (
                  <div
                    className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-900"
                    data-testid="staff-support-handoff-needs-follow-up-badge"
                  >
                    <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('table.needs_follow_up')}</span>
                  </div>
                ) : null}
                {handoff.claim ? (
                  <Button asChild variant="link" size="sm" className="h-auto px-0 py-1 text-xs">
                    <Link
                      href={`/staff/claims/${handoff.claim.id}`}
                      data-testid="staff-support-handoff-claim-link"
                    >
                      {handoff.claim.claimNumber || handoff.claim.title || t('table.claim_link')}
                    </Link>
                  </Button>
                ) : (
                  <div className="mt-1 text-xs text-muted-foreground">{t('table.no_claim')}</div>
                )}
              </div>
              <div>
                <div className="font-medium text-slate-900">{handoff.member.name}</div>
                <div className="text-xs text-muted-foreground">
                  {handoff.member.memberNumber || t('table.no_member_number')}
                </div>
                <div className="text-xs text-muted-foreground">{handoff.member.email}</div>
              </div>
              <div
                className="space-y-1 text-xs text-muted-foreground"
                data-testid="staff-support-handoff-relationship"
              >
                <div>{handoff.relationship.branchName || t('table.no_branch')}</div>
                <div>{handoff.relationship.planName || t('table.no_plan')}</div>
                <div>{handoff.relationship.agentName || t('table.no_agent')}</div>
              </div>
              <div>
                <div className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-900">
                  {t(`urgency.${handoff.urgency}`)}
                </div>
                <div className="mt-2 text-xs font-medium text-slate-700">
                  {t(`trust_risk.${handoff.trustRisk}`)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t(`status.${handoff.status}`)}
                </div>
              </div>
              <div>
                <div className="font-medium text-slate-900">
                  {handoff.staffName || t('table.unassigned')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(handoff.createdAt).toLocaleDateString(locale)}
                </div>
              </div>
              <div className="space-y-3 text-right">
                {staffSession.user.role === 'staff' && handoff.status === 'open' ? (
                  <form
                    action={acceptSupportHandoff}
                    data-testid="staff-support-handoff-accept-form"
                  >
                    <input type="hidden" name="handoffId" value={handoff.id} />
                    <input type="hidden" name="expectedVersion" value={handoff.lifecycleVersion} />
                    <Button type="submit" size="sm" data-testid="staff-support-handoff-accept">
                      {t('actions.accept')}
                    </Button>
                  </form>
                ) : null}
                {staffSession.user.role === 'staff' &&
                handoff.status === 'accepted' &&
                handoff.staffId === staffSession.user.id ? (
                  <form
                    action={reassignSupportHandoff}
                    className="space-y-2"
                    data-testid="staff-support-handoff-reassign-form"
                  >
                    <input type="hidden" name="handoffId" value={handoff.id} />
                    <input type="hidden" name="expectedVersion" value={handoff.lifecycleVersion} />
                    <select
                      name="nextStaffId"
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                      defaultValue={handoff.staffId ?? staffSession.user.id}
                      data-testid="staff-support-handoff-reassign-staff"
                    >
                      {staffOptions
                        .filter(staff => staff.role === 'staff')
                        .map(staff => (
                          <option key={staff.id} value={staff.id}>
                            {staff.name || staff.email}
                          </option>
                        ))}
                    </select>
                    <input
                      name="reason"
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                      placeholder={t('actions.reassign_reason')}
                      required
                      data-testid="staff-support-handoff-reassign-reason"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      data-testid="staff-support-handoff-reassign"
                    >
                      {t('actions.reassign')}
                    </Button>
                  </form>
                ) : null}
                {staffSession.user.role === 'staff' &&
                handoff.status === 'accepted' &&
                handoff.staffId === staffSession.user.id ? (
                  <form
                    action={closeSupportHandoff}
                    className="space-y-2"
                    data-testid="staff-support-handoff-close-form"
                  >
                    <input type="hidden" name="handoffId" value={handoff.id} />
                    <input type="hidden" name="expectedVersion" value={handoff.lifecycleVersion} />
                    <input
                      name="reason"
                      className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                      placeholder={t('actions.close_reason')}
                      required
                      data-testid="staff-support-handoff-close-reason"
                    />
                    <Button
                      type="submit"
                      size="sm"
                      variant="outline"
                      data-testid="staff-support-handoff-close"
                    >
                      {t('actions.close')}
                    </Button>
                  </form>
                ) : null}
                {staffSession.user.role === 'branch_manager' ? (
                  <span
                    className="text-xs font-medium text-muted-foreground"
                    data-testid="staff-support-handoff-readonly"
                  >
                    {t('actions.readonly')}
                  </span>
                ) : null}
              </div>
              <SupportHandoffDetailPanel
                canRespond={
                  staffSession.user.role === 'staff' &&
                  handoff.status === 'accepted' &&
                  handoff.staffId === staffSession.user.id
                }
                createdAt={handoff.createdAt}
                handoffId={handoff.id}
                labels={detailLabels}
                locale={locale}
                message={handoff.message}
              />
            </SupportHandoffAttentionRow>
          ))}
          {queue.length === 0 ? (
            <div
              className="px-4 py-10 text-center text-muted-foreground"
              data-testid="staff-support-handoffs-empty"
            >
              {t('empty')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
