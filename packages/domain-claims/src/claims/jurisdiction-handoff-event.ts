import { appendEvent } from '@interdomestik/database';

import { HANDOFF_DOCUMENT_CLASSES } from './jurisdiction-handoff-document-classes';
import { stableHandoffId } from './jurisdiction-handoff-ids';
import type { HandoffTx, JurisdictionHandoffParams } from './jurisdiction-handoff-types';

export async function appendHandoffEvent(
  tx: HandoffTx,
  params: JurisdictionHandoffParams,
  args: {
    correlationId: string;
    grantId: string;
    incidentCountryCode: string;
    now: Date;
    recoveryLegalTenantId: string;
    version: number;
  }
): Promise<void> {
  await appendEvent(tx, {
    actor: { id: params.actor.id, role: params.actor.role },
    aggregateVersion: args.version,
    correlationId: args.correlationId,
    createdAt: args.now,
    entity: { id: params.claimId, type: 'recovery' },
    eventName: 'recovery.handed_off_to_jurisdiction',
    eventVersion: 1,
    id: stableHandoffId('event', ['recovery.handed_off_to_jurisdiction', args.grantId]),
    payload: {
      documentClasses: [...HANDOFF_DOCUMENT_CLASSES],
      fromTenantId: params.homeTenantId,
      grantActorId: params.grantActorId,
      grantExpiresAt: params.grantExpiresAt?.toISOString() ?? null,
      grantId: args.grantId,
      grantIssued: true,
      grantReasonCode: 'incident_jurisdiction',
      incidentCountryCode: args.incidentCountryCode,
      recoveryLegalTenantId: args.recoveryLegalTenantId,
    },
    tenantId: params.homeTenantId,
  });
}
