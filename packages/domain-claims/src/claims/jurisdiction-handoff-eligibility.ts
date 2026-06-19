import { resolveRecoveryLaw } from '@interdomestik/domain-recovery';

import { canInitiateHandoff } from './jurisdiction-handoff-auth';
import type { HandoffClaimRow, JurisdictionHandoffParams } from './jurisdiction-handoff-types';

type ContinueHandoff = {
  status: 'continue';
  recovery: {
    incidentCountryCode: string;
    recoveryLegalTenantId: string;
  };
};

type StopHandoff =
  | { status: 'stop'; result: { success: false; error: 'actor_not_authorized' } }
  | { status: 'stop'; result: { success: false; error: 'recovery_legal_tenant_conflict' } }
  | { status: 'stop'; result: { success: false; error: 'self_grant_denied' } }
  | { status: 'stop'; result: { success: false; error: 'unsupported_incident_jurisdiction' } }
  | { status: 'stop'; result: { success: true; grant: null; status: 'not_required' } };

export function resolveJurisdictionHandoffEligibility(
  claim: HandoffClaimRow,
  params: JurisdictionHandoffParams
): ContinueHandoff | StopHandoff {
  if (!canInitiateHandoff(params.actor, claim)) {
    return { status: 'stop', result: { success: false, error: 'actor_not_authorized' } };
  }

  const recovery = resolveRecoveryLaw({ incidentCountryCode: claim.incidentCountryCode });
  if (recovery.outcome !== 'recovery_law_resolved') {
    return {
      status: 'stop',
      result: { success: false, error: 'unsupported_incident_jurisdiction' },
    };
  }

  if (recovery.recoveryLegalTenantId === params.homeTenantId) {
    return { status: 'stop', result: { success: true, grant: null, status: 'not_required' } };
  }

  if (
    claim.recoveryLegalTenantId &&
    claim.recoveryLegalTenantId !== recovery.recoveryLegalTenantId
  ) {
    return { status: 'stop', result: { success: false, error: 'recovery_legal_tenant_conflict' } };
  }

  if (params.grantActorId === params.actor.id) {
    return { status: 'stop', result: { success: false, error: 'self_grant_denied' } };
  }

  return {
    status: 'continue',
    recovery: {
      incidentCountryCode: recovery.incidentCountryCode,
      recoveryLegalTenantId: recovery.recoveryLegalTenantId,
    },
  };
}
