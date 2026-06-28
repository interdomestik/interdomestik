import { randomUUID } from 'node:crypto';

import { ensureTenantId } from '@interdomestik/shared-auth';

import { parseMemberSupportHandoffInput } from './create-input';
import { persistMemberSupportHandoff } from './create-store';
import {
  type CreateSupportHandoffInput,
  type SupportHandoffActionResult,
  type SupportHandoffDeps,
  type SupportHandoffSession,
} from './types';

export async function createMemberSupportHandoffCore(
  params: {
    input: CreateSupportHandoffInput & Record<string, unknown>;
    requestHeaders?: Headers;
    session: SupportHandoffSession | null;
  },
  deps: SupportHandoffDeps = {}
): Promise<SupportHandoffActionResult<{ id: string }>> {
  if (params.session?.user?.role !== 'member' && params.session?.user?.role !== 'user') {
    return { success: false, error: 'Unauthorized' };
  }

  let tenantId: string;
  try {
    tenantId = ensureTenantId(params.session);
  } catch {
    return { success: false, error: 'Unauthorized' };
  }
  const memberId = params.session.user.id;
  const parsed = parseMemberSupportHandoffInput(params.input);
  if (!parsed.success) return parsed;

  const handoffId = `support_handoff_${randomUUID()}`;
  const now = new Date();
  const persisted = await persistMemberSupportHandoff({
    contactPreference: parsed.contactPreference,
    handoffId,
    memberBranchId: params.session.user.branchId,
    memberId,
    memberRole: params.session.user.role,
    message: parsed.message,
    now,
    requestedClaimId: parsed.requestedClaimId,
    sourceClaimId: parsed.sourceClaimId,
    sourceHint: parsed.sourceHint,
    subject: parsed.subject,
    tenantId,
  });

  if (!persisted.success) {
    return { success: false, error: persisted.error };
  }

  if (deps.logAuditEvent) {
    await deps.logAuditEvent({
      actorId: memberId,
      actorRole: params.session.user.role,
      tenantId,
      action: 'support_handoff.created',
      entityType: 'support_handoff',
      entityId: handoffId,
      metadata: {
        claimId: persisted.claimId,
        source: persisted.source,
        urgency: persisted.signals.urgency,
        trustRisk: persisted.signals.trustRisk,
      },
      headers: params.requestHeaders,
    });
  }

  return { success: true, data: { id: handoffId } };
}
