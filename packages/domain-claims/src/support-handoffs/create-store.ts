import { supportHandoffs, withTenantContext } from '@interdomestik/database';

import { deriveSupportHandoffSignals } from './derivation';
import {
  type ClaimContext,
  getMemberSubscriptionBranch,
  getOwnedClaimContext,
} from './create-store-queries';
import type { SupportHandoffContactPreference, SupportHandoffSource } from './types';

function deriveSource(args: {
  claimContext: ClaimContext | null;
  sourceClaimId: string;
  sourceHint: string | null;
}): SupportHandoffSource {
  if (args.sourceHint === 'member_claim_detail' && args.sourceClaimId === args.claimContext?.id) {
    return 'member_claim_detail';
  }

  return 'member_help';
}

export async function persistMemberSupportHandoff(params: {
  contactPreference: SupportHandoffContactPreference;
  handoffId: string;
  memberBranchId?: string | null;
  memberId: string;
  memberRole: string;
  message: string;
  now: Date;
  requestedClaimId: string | null;
  sourceClaimId: string;
  sourceHint: string | null;
  subject: string;
  tenantId: string;
}) {
  return withTenantContext({ tenantId: params.tenantId, role: params.memberRole }, async tx => {
    const claimContext = params.requestedClaimId
      ? await getOwnedClaimContext({
          database: tx,
          claimId: params.requestedClaimId,
          memberId: params.memberId,
          tenantId: params.tenantId,
        })
      : null;

    if (params.requestedClaimId && claimContext == null) {
      return { success: false as const, error: 'Claim not found or access denied' };
    }

    const branchId =
      claimContext?.branchId ??
      params.memberBranchId ??
      (await getMemberSubscriptionBranch(tx, {
        memberId: params.memberId,
        tenantId: params.tenantId,
      }));
    if (!branchId)
      return { success: false as const, error: 'Branch is required for support routing' };

    const signals = deriveSupportHandoffSignals({ claim: claimContext });
    const source = deriveSource({
      claimContext,
      sourceClaimId: params.sourceClaimId,
      sourceHint: params.sourceHint,
    });

    // db-access-guard: tenant-scoped -- reason: tenantId from validated member session before support handoff insert
    await tx.insert(supportHandoffs).values({
      id: params.handoffId,
      tenantId: params.tenantId,
      memberId: params.memberId,
      branchId,
      claimId: claimContext?.id ?? null,
      source,
      subject: params.subject,
      message: params.message,
      contactPreference: params.contactPreference,
      status: 'open',
      urgency: signals.urgency,
      trustRisk: signals.trustRisk,
      createdAt: params.now,
      updatedAt: params.now,
    });

    return {
      success: true as const,
      claimId: claimContext?.id ?? null,
      signals,
      source,
    };
  });
}
