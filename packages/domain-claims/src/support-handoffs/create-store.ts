import { supportHandoffs } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

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
  authority: TenantAuthority;
  contactPreference: SupportHandoffContactPreference;
  handoffId: string;
  memberBranchId?: string | null;
  memberId: string;
  message: string;
  now: Date;
  requestedClaimId: string | null;
  sourceClaimId: string;
  sourceHint: string | null;
  subject: string;
}) {
  const { tenantId } = readTenantAuthority(params.authority);
  return withTenantAuthority(params.authority, async tx => {
    const claimContext = params.requestedClaimId
      ? await getOwnedClaimContext({
          database: tx,
          claimId: params.requestedClaimId,
          memberId: params.memberId,
          tenantId,
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
        tenantId,
      }));
    if (!branchId)
      return { success: false as const, error: 'Branch is required for support routing' };

    const signals = deriveSupportHandoffSignals({ claim: claimContext });
    const source = deriveSource({
      claimContext,
      sourceClaimId: params.sourceClaimId,
      sourceHint: params.sourceHint,
    });

    await tx.insert(supportHandoffs).values({
      id: params.handoffId,
      tenantId,
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
