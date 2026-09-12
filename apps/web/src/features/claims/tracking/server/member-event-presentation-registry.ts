import type { ClaimStatus } from '@interdomestik/database/constants';
import { CLAIM_STATUSES } from '@interdomestik/database/constants';
import type { ClaimTimelineEvent } from '../types';

export type MemberEventPresentationContext = Readonly<{
  currentStatus: ClaimStatus;
  piiStatus?: 'available' | 'erased_or_unavailable';
}>;

export type MemberEventPresentationRow = Readonly<{
  createdAt: Date;
  eventName: string;
  eventVersion: number;
  id: string;
  note: string | null;
  payload: unknown;
}>;

type VerifiedEventKey =
  | 'case.created@1'
  | 'case.lifecycle_changed@1'
  | 'claim.status_changed@1'
  | 'recovery.lifecycle_changed@1'
  | 'recovery.decision_recorded@1'
  | 'recovery.escalation_agreement_recorded@1'
  | 'recovery.success_fee_collected@1'
  | 'recovery.handed_off_to_jurisdiction@1'
  | 'membership.agent_client_bound@1'
  | 'membership.agent_attribution_recorded@1'
  | 'membership.entity_migrated@1'
  | 'membership.subscription_changed@1';

type EventRenderer = (
  context: MemberEventPresentationContext,
  row: MemberEventPresentationRow
) => ClaimTimelineEvent;

const CLAIM_STATUS_SET = new Set<string>(CLAIM_STATUSES);

function isClaimStatus(value: unknown): value is ClaimStatus {
  return typeof value === 'string' && CLAIM_STATUS_SET.has(value);
}

function buildFixedEvent(
  context: MemberEventPresentationContext,
  row: MemberEventPresentationRow,
  labelKey: string,
  overrides: Partial<Pick<ClaimTimelineEvent, 'statusFrom' | 'statusTo' | 'note'>> = {}
): ClaimTimelineEvent {
  return {
    id: row.id,
    date: row.createdAt,
    statusFrom: overrides.statusFrom ?? null,
    statusTo: overrides.statusTo ?? context.currentStatus,
    labelKey,
    note: overrides.note ?? null,
    isPublic: true,
  };
}

function renderCaseUpdate(
  context: MemberEventPresentationContext,
  row: MemberEventPresentationRow
): ClaimTimelineEvent {
  return buildFixedEvent(context, row, 'claims-tracking.tracking.timeline.caseUpdate');
}

function renderRecoveryUpdate(
  context: MemberEventPresentationContext,
  row: MemberEventPresentationRow
): ClaimTimelineEvent {
  return buildFixedEvent(context, row, 'claims-tracking.tracking.timeline.recoveryUpdate');
}

function renderMembershipUpdate(
  context: MemberEventPresentationContext,
  row: MemberEventPresentationRow
): ClaimTimelineEvent {
  return buildFixedEvent(context, row, 'claims-tracking.tracking.timeline.membershipUpdate');
}

function renderGenericFallback(
  context: MemberEventPresentationContext,
  row: MemberEventPresentationRow
): ClaimTimelineEvent {
  return buildFixedEvent(context, row, 'claims-tracking.tracking.timeline.generic');
}

function renderRedacted(
  context: MemberEventPresentationContext,
  row: MemberEventPresentationRow
): ClaimTimelineEvent {
  return buildFixedEvent(context, row, 'claims-tracking.tracking.timeline.redacted');
}

function renderClaimStatusChanged(
  context: MemberEventPresentationContext,
  row: MemberEventPresentationRow
): ClaimTimelineEvent {
  if (!row.payload || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
    return renderGenericFallback(context, row);
  }

  const payload = row.payload as Readonly<Record<string, unknown>>;
  const fromStatus = payload.fromStatus;
  const toStatus = payload.toStatus;

  if (!isClaimStatus(fromStatus) || !isClaimStatus(toStatus)) {
    return renderGenericFallback(context, row);
  }

  return {
    id: row.id,
    date: row.createdAt,
    statusFrom: fromStatus,
    statusTo: toStatus,
    labelKey: `claims-tracking.status.${toStatus}`,
    note: row.note,
    isPublic: true,
  };
}

// Only claim.status_changed is currently selected by the member query; other entries are prepared mappings, not live member history.
const registry = {
  'case.created@1': renderCaseUpdate,
  'case.lifecycle_changed@1': renderCaseUpdate,
  'claim.status_changed@1': renderClaimStatusChanged,
  'recovery.lifecycle_changed@1': renderRecoveryUpdate,
  'recovery.decision_recorded@1': renderRecoveryUpdate,
  'recovery.escalation_agreement_recorded@1': renderRecoveryUpdate,
  'recovery.success_fee_collected@1': renderRecoveryUpdate,
  'recovery.handed_off_to_jurisdiction@1': renderRecoveryUpdate,
  'membership.agent_client_bound@1': renderMembershipUpdate,
  'membership.agent_attribution_recorded@1': renderMembershipUpdate,
  'membership.entity_migrated@1': renderMembershipUpdate,
  'membership.subscription_changed@1': renderMembershipUpdate,
} satisfies Record<VerifiedEventKey, EventRenderer>;

const eventRegistry: Readonly<Record<string, EventRenderer | undefined>> = registry;

export function presentMemberDomainEvent(
  context: MemberEventPresentationContext,
  row: MemberEventPresentationRow
): ClaimTimelineEvent {
  if (context.piiStatus === 'erased_or_unavailable') {
    return renderRedacted(context, row);
  }

  const renderer = eventRegistry[`${row.eventName}@${row.eventVersion}`];
  return renderer ? renderer(context, row) : renderGenericFallback(context, row);
}
