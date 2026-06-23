import { classifyEntityMigrationReadinessCandidate } from '../entity-migration-readiness';

import type { EntityMigrationReadinessCandidate } from '../entity-migration-readiness';
import type {
  MemberEntityMigrationApproval,
  MemberEntityMigrationBlockedStatus,
  MemberEntityMigrationCommand,
  MemberEntityMigrationPlan,
  MemberEntityMigrationTarget,
  MemberEntitySnapshot,
} from './types';

export function buildMemberEntityMigrationPlan(
  command: MemberEntityMigrationCommand
): MemberEntityMigrationPlan {
  const readiness = classifyEntityMigrationReadinessCandidate(command.candidate);
  const previous = buildPreviousSnapshot(command.candidate);
  const target = buildTarget(command.candidate);
  const approval = normalizeApproval(command.approval);

  if (readiness.status === 'blocked_active_recovery_runoff') {
    return blockedPlan(
      command,
      previous,
      target,
      approval,
      readiness,
      'blocked_active_recovery_runoff'
    );
  }

  const subscriptionId = command.candidate.subscriptionId;

  if (readiness.status === 'blocked_repair_required' || !target || !subscriptionId) {
    return blockedPlan(command, previous, target, approval, readiness, 'blocked_repair_required');
  }

  if (command.mode === 'dry_run') {
    return readyPlan(
      command,
      previous,
      target,
      approval,
      readiness,
      subscriptionId,
      'dry_run_ready',
      false
    );
  }

  if (command.approval && !approval) {
    return blockedPlan(command, previous, target, null, readiness, 'blocked_invalid_approval');
  }

  if (!approval) {
    return blockedPlan(command, previous, target, null, readiness, 'blocked_approval_required');
  }

  return readyPlan(command, previous, target, approval, readiness, subscriptionId, 'ready', true);
}

function buildPreviousSnapshot(candidate: EntityMigrationReadinessCandidate): MemberEntitySnapshot {
  return {
    legalTenantId: candidate.subscriptionLegalTenantId,
    legalEntityId: candidate.subscriptionLegalEntityId,
    governingLawSnapshot: candidate.governingLawSnapshot,
    termsVersionAccepted: candidate.termsVersionAccepted,
  };
}

function buildTarget(
  candidate: EntityMigrationReadinessCandidate
): MemberEntityMigrationTarget | null {
  const legalEntity = candidate.targetLegalEntity;
  if (!legalEntity?.governingLaw || !legalEntity.termsVersion) {
    return null;
  }

  return {
    legalTenantId: candidate.tenantId,
    legalEntityId: legalEntity.id,
    governingLawSnapshot: legalEntity.governingLaw,
    termsVersionAccepted: legalEntity.termsVersion,
  };
}

function normalizeApproval(
  approval: MemberEntityMigrationApproval | null | undefined
): MemberEntityMigrationApproval | null {
  if (!approval) return null;
  return approval.reference.trim() && approval.approvedBy.trim() ? approval : null;
}

function blockedPlan(
  command: MemberEntityMigrationCommand,
  previous: MemberEntitySnapshot,
  target: MemberEntityMigrationTarget | null,
  approval: MemberEntityMigrationApproval | null,
  readiness: ReturnType<typeof classifyEntityMigrationReadinessCandidate>,
  status: MemberEntityMigrationBlockedStatus
): MemberEntityMigrationPlan {
  return {
    memberId: command.candidate.memberId,
    tenantId: command.candidate.tenantId,
    subscriptionId: command.candidate.subscriptionId ?? 'missing',
    mode: command.mode,
    status,
    previous,
    target,
    readiness,
    termsAction: null,
    approval,
    dataRepairCategories: readiness.repairCategories,
    writesPlanned: false,
  };
}

function readyPlan(
  command: MemberEntityMigrationCommand,
  previous: MemberEntitySnapshot,
  target: MemberEntityMigrationTarget,
  approval: MemberEntityMigrationApproval | null,
  readiness: ReturnType<typeof classifyEntityMigrationReadinessCandidate>,
  subscriptionId: string,
  status: 'ready' | 'dry_run_ready',
  writesPlanned: boolean
): MemberEntityMigrationPlan {
  return {
    memberId: command.candidate.memberId,
    tenantId: command.candidate.tenantId,
    subscriptionId,
    mode: command.mode,
    status,
    previous,
    target,
    readiness,
    termsAction: 'reissue_and_recapture',
    approval,
    dataRepairCategories: [],
    writesPlanned,
  };
}
