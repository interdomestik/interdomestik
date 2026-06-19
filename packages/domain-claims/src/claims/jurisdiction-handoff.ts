import { db } from '@interdomestik/database';
import { resolveRecoveryLaw } from '@interdomestik/domain-recovery';
import type { CaseScopedAccessGrant } from '@interdomestik/shared-auth';

import { canInitiateHandoff, toSessionGrant } from './jurisdiction-handoff-auth';
import { JurisdictionHandoffRollbackError } from './jurisdiction-handoff-errors';
import { appendHandoffEvent } from './jurisdiction-handoff-event';
import { defaultHandoffCorrelationId, stableHandoffId } from './jurisdiction-handoff-ids';
import {
  insertHandoffGrant,
  isGrantActorInRecoveryTenant,
  loadHandoffClaim,
  lockHandoffClaim,
  setRecoveryLegalTenantIfUnset,
} from './jurisdiction-handoff-store';
import type { HandoffTx, JurisdictionHandoffParams } from './jurisdiction-handoff-types';

export type { JurisdictionHandoffParams } from './jurisdiction-handoff-types';

export type JurisdictionHandoffResult =
  | { success: true; grant: CaseScopedAccessGrant; status: 'created' | 'already_exists' }
  | { success: true; grant: null; status: 'not_required' }
  | {
      success: false;
      error:
        | 'actor_not_authorized'
        | 'claim_not_found'
        | 'grant_actor_not_recovery_tenant'
        | 'handoff_active_grant_conflict'
        | 'handoff_correlation_conflict'
        | 'handoff_grant_revoked'
        | 'recovery_legal_tenant_conflict'
        | 'self_grant_denied'
        | 'unsupported_incident_jurisdiction';
    };

export async function recordJurisdictionHandoffInTransaction(
  tx: HandoffTx,
  params: JurisdictionHandoffParams
): Promise<JurisdictionHandoffResult> {
  const now = params.now ?? new Date();
  await lockHandoffClaim(tx, params.homeTenantId, params.claimId);
  const claim = await loadHandoffClaim(tx, params.homeTenantId, params.claimId);
  if (!claim) return { success: false, error: 'claim_not_found' };
  if (!canInitiateHandoff(params.actor, claim))
    return { success: false, error: 'actor_not_authorized' };

  const recovery = resolveRecoveryLaw({ incidentCountryCode: claim.incidentCountryCode });
  if (recovery.outcome !== 'recovery_law_resolved') {
    return { success: false, error: 'unsupported_incident_jurisdiction' };
  }
  if (recovery.recoveryLegalTenantId === params.homeTenantId) {
    return { success: true, grant: null, status: 'not_required' };
  }
  if (
    claim.recoveryLegalTenantId &&
    claim.recoveryLegalTenantId !== recovery.recoveryLegalTenantId
  ) {
    return { success: false, error: 'recovery_legal_tenant_conflict' };
  }
  if (params.grantActorId === params.actor.id)
    return { success: false, error: 'self_grant_denied' };
  if (
    !(await isGrantActorInRecoveryTenant(tx, params.grantActorId, recovery.recoveryLegalTenantId))
  ) {
    return { success: false, error: 'grant_actor_not_recovery_tenant' };
  }

  if (!claim.recoveryLegalTenantId) {
    const updated = await setRecoveryLegalTenantIfUnset({
      claimId: params.claimId,
      expectedCurrentTenantId: null,
      homeTenantId: params.homeTenantId,
      now,
      recoveryLegalTenantId: recovery.recoveryLegalTenantId,
      tx,
    });
    if (!updated) return { success: false, error: 'recovery_legal_tenant_conflict' };
  }

  const correlationId =
    params.correlationId ??
    defaultHandoffCorrelationId({
      claimId: params.claimId,
      grantActorId: params.grantActorId,
      recoveryLegalTenantId: recovery.recoveryLegalTenantId,
    });
  const grantId = stableHandoffId('csg', [
    params.homeTenantId,
    recovery.recoveryLegalTenantId,
    params.claimId,
    params.grantActorId,
  ]);
  const grant = toSessionGrant({
    accessTenantId: recovery.recoveryLegalTenantId,
    actorId: params.grantActorId,
    caseId: params.claimId,
    expiresAt: params.grantExpiresAt ?? null,
  });

  const insertStatus = await insertHandoffGrant({
    actorId: params.grantActorId,
    caseId: params.claimId,
    correlationId,
    createdAt: now,
    createdById: params.actor.id,
    expiresAt: params.grantExpiresAt ?? null,
    grantId,
    homeTenantId: params.homeTenantId,
    recoveryLegalTenantId: recovery.recoveryLegalTenantId,
    tx,
  });
  if (insertStatus === 'already_exists') return { success: true, grant, status: 'already_exists' };
  if (insertStatus === 'active_grant_conflict') {
    throw new JurisdictionHandoffRollbackError('handoff_active_grant_conflict');
  }
  if (insertStatus === 'correlation_conflict') {
    throw new JurisdictionHandoffRollbackError('handoff_correlation_conflict');
  }
  if (insertStatus === 'revoked_exists') {
    throw new JurisdictionHandoffRollbackError('handoff_grant_revoked');
  }

  await appendHandoffEvent(tx, params, {
    correlationId,
    grantId,
    incidentCountryCode: recovery.incidentCountryCode,
    now,
    recoveryLegalTenantId: recovery.recoveryLegalTenantId,
    version: claim.lifecycleVersion,
  });
  return { success: true, grant, status: 'created' };
}

export async function recordJurisdictionHandoff(
  params: JurisdictionHandoffParams
): Promise<JurisdictionHandoffResult> {
  try {
    // db-access-guard: tenant-scoped -- reason: homeTenantId is validated by the caller and every transaction read/write constrains tenant, claim, actor, or deterministic handoff identity.
    return await db.transaction(tx => recordJurisdictionHandoffInTransaction(tx, params));
  } catch (error) {
    if (error instanceof JurisdictionHandoffRollbackError) {
      return { success: false, error: error.code };
    }
    throw error;
  }
}
