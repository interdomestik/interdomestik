import { getTranslations } from 'next-intl/server';
import {
  ATTENTION_FILTERS,
  CLAIM_LINK_FILTERS,
  STATUS_FILTERS,
  URGENCY_FILTERS,
  buildSupportHandoffsHref,
  getFilterOptions,
  parseAssignmentFilter,
  parseAttentionFilter,
  parseClaimLinkFilter,
  parseSearchTerm,
  parseStatusFilter,
  parseUrgencyFilter,
} from './support-handoff-filters';

export const getContentTranslations = () => getTranslations('agent-claims.claims.support_handoffs');
export type ContentTranslations = Awaited<ReturnType<typeof getContentTranslations>>;

export function handoffContentPresentation(
  t: ContentTranslations,
  role: string,
  resolvedSearchParams: Record<string, string | string[] | undefined>
) {
  const currentAssignment = parseAssignmentFilter(resolvedSearchParams.assigned, role);
  const currentUrgency = parseUrgencyFilter(resolvedSearchParams.urgency);
  const currentClaim = parseClaimLinkFilter(resolvedSearchParams.claim);
  const currentAttention = parseAttentionFilter(resolvedSearchParams.attention);
  const currentStatus = parseStatusFilter(resolvedSearchParams.status, currentAttention);
  const currentSearch = parseSearchTerm(resolvedSearchParams.search);
  const assignmentLabels = {
    all:
      role === 'branch_manager'
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
    role === 'staff' ? (['all', 'mine', 'unassigned'] as const) : (['all', 'unassigned'] as const);
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
    values: currentAttention === 'needs_follow_up' ? (['accepted'] as const) : STATUS_FILTERS,
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

  return {
    currentAssignment,
    currentUrgency,
    currentClaim,
    currentAttention,
    currentStatus,
    currentSearch,
    assignmentOptions,
    statusOptions,
    urgencyOptions,
    claimOptions,
    attentionOptions,
    hiddenFields,
    detailLabels,
  };
}

export type ContentPresentation = ReturnType<typeof handoffContentPresentation>;
