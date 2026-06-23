import { buildMemberEntityMigrationPlan } from './planning';

import type {
  MemberEntityMigrationCommand,
  MemberEntityMigrationEventPayload,
  MemberEntityMigrationResult,
  MemberEntitySnapshot,
  MemberEntityMigrationWritePort,
  MemberEntityRollbackCommand,
} from './types';

export async function executeMemberEntityMigration(
  command: MemberEntityMigrationCommand,
  port: MemberEntityMigrationWritePort
): Promise<MemberEntityMigrationResult> {
  const plan = buildMemberEntityMigrationPlan(command);
  if (plan.status === 'dry_run_ready') {
    return { ok: true, plan, eventPayload: null };
  }
  if (plan.status !== 'ready') {
    return { ok: false, plan, reason: plan.status };
  }
  if (!plan.target || !plan.approval) {
    throw new Error('ready member entity migration plan is missing target or approval');
  }

  const target = plan.target;
  const approval = plan.approval;

  return port.withTransaction(async () => {
    await port.updateSubscriptionLegalEntity({
      subscriptionId: plan.subscriptionId,
      tenantId: plan.tenantId,
      target,
    });
    await port.recordTermsAcceptance({
      memberId: plan.memberId,
      tenantId: plan.tenantId,
      subscriptionId: plan.subscriptionId,
      termsVersion: target.termsVersionAccepted,
      approval,
    });
    await port.appendMigrationHistory({
      memberId: plan.memberId,
      tenantId: plan.tenantId,
      subscriptionId: plan.subscriptionId,
      previous: plan.previous,
      target,
      termsAction: 'reissue_and_recapture',
      approval,
    });

    const eventPayload = buildEntityMigratedEventPayload(
      plan.previous,
      target,
      approval.kind,
      'apply',
      plan.readiness.activeRecoveryCaseCount
    );
    await port.appendEntityMigratedEvent({
      memberId: plan.memberId,
      tenantId: plan.tenantId,
      subscriptionId: plan.subscriptionId,
      payload: eventPayload,
    });

    return { ok: true, plan, eventPayload };
  });
}

export async function rollbackMemberEntityMigration(
  command: MemberEntityRollbackCommand,
  port: MemberEntityMigrationWritePort
): Promise<MemberEntityMigrationEventPayload> {
  if (command.activeRecoveryCaseCount > 0) {
    throw new Error('member entity migration rollback blocked by active recovery cases');
  }
  assertRollbackTargetBelongsToTenant(command.previous, command.tenantId);

  return port.withTransaction(async () => {
    await port.updateSubscriptionLegalEntity({
      subscriptionId: command.subscriptionId,
      tenantId: command.tenantId,
      target: command.previous,
    });
    await port.appendMigrationHistory({
      memberId: command.memberId,
      tenantId: command.tenantId,
      subscriptionId: command.subscriptionId,
      previous: command.current,
      target: command.previous,
      termsAction: 'reissue_and_recapture',
      approval: command.approval,
    });

    const payload = buildEntityMigratedEventPayload(
      command.current,
      command.previous,
      command.approval.kind,
      'rollback',
      command.activeRecoveryCaseCount
    );
    await port.appendEntityMigratedEvent({
      memberId: command.memberId,
      tenantId: command.tenantId,
      subscriptionId: command.subscriptionId,
      payload,
    });
    return payload;
  });
}

function assertRollbackTargetBelongsToTenant(
  previous: MemberEntitySnapshot,
  tenantId: string
): void {
  if (!previous.legalTenantId || previous.legalTenantId !== tenantId) {
    throw new Error('member entity migration rollback target is outside tenant legal boundary');
  }
}

function buildEntityMigratedEventPayload(
  previous: {
    legalTenantId: string | null;
    legalEntityId: string | null;
    governingLawSnapshot: string | null;
    termsVersionAccepted: string | null;
  },
  target: MemberEntitySnapshot,
  approvalKind: 'human_approval' | 'explicit_waiver',
  migrationMode: 'apply' | 'rollback',
  activeRecoveryCaseCount: number
): MemberEntityMigrationEventPayload {
  return {
    activeRecoveryCaseCount,
    approvalKind,
    fromGoverningLaw: previous.governingLawSnapshot,
    fromLegalEntityId: previous.legalEntityId,
    fromLegalTenantId: previous.legalTenantId,
    fromTermsVersionAccepted: previous.termsVersionAccepted,
    migrationMode,
    termsAction: 'reissue_and_recapture',
    toGoverningLaw: target.governingLawSnapshot,
    toLegalEntityId: target.legalEntityId,
    toLegalTenantId: target.legalTenantId,
    toTermsVersionAccepted: target.termsVersionAccepted,
  };
}
