import { db } from '@interdomestik/database';
import { createCommissionCore } from './create';
import { calculateCommission } from './types';
import { resolveCommissionOwnership } from './ownership';

type RenewalNoCommissionReason = 'company_owned' | 'unresolved';

type RenewalNoCommissionResult = {
  kind: 'no-op';
  noCommissionReason: RenewalNoCommissionReason;
  ownerType: 'company' | 'unresolved';
  ownershipDiagnostics: ReturnType<typeof resolveCommissionOwnership>['diagnostics'];
};

type RenewalCreatedResult = {
  kind: 'created';
  id: string;
};

export type RenewalCommissionResult =
  | { success: true; data: RenewalCreatedResult | RenewalNoCommissionResult }
  | { success: false; error: string };

export async function createRenewalCommissionCore(data: {
  tenantId: string;
  memberId?: string;
  subscriptionId?: string;
  priceId?: string;
  transactionTotal: number;
  currency?: string;
  subscriptionAgentId?: string | null;
  userAgentId?: string | null;
  agentClientAgentIds?: Array<string | null | undefined>;
  originalSellerAgentId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<RenewalCommissionResult> {
  try {
    const ownership = resolveCommissionOwnership({
      subscriptionAgentId: data.subscriptionAgentId,
      userAgentId: data.userAgentId ?? null,
      agentClientAgentIds: data.agentClientAgentIds,
    });

    if (ownership.ownerType !== 'agent' || !ownership.agentId) {
      const reason: RenewalNoCommissionReason =
        ownership.ownerType === 'unresolved' ? 'unresolved' : 'company_owned';
      return {
        success: true,
        data: {
          kind: 'no-op',
          noCommissionReason: reason,
          ownerType: ownership.ownerType === 'unresolved' ? 'unresolved' : 'company',
          ownershipDiagnostics: ownership.diagnostics,
        } satisfies RenewalNoCommissionResult,
      };
    }

    const resolvedAgentId = ownership.agentId;
    const agentSettings = await db.query.agentSettings?.findFirst({
      where: (settings, { and, eq }) =>
        and(eq(settings.agentId, resolvedAgentId), eq(settings.tenantId, data.tenantId)),
    });
    const customRates = agentSettings?.commissionRates as Record<string, number> | undefined;
    const amount = calculateCommission('renewal', data.transactionTotal, customRates);
    const ownershipResolvedFrom = [
      'subscription.agentId',
      ...ownership.diagnostics
        .map(diagnostic => diagnostic.source)
        .filter(source => source !== 'subscription.agentId'),
    ];

    const commissionResult = await createCommissionCore({
      agentId: resolvedAgentId,
      memberId: data.memberId,
      subscriptionId: data.subscriptionId,
      type: 'renewal',
      amount,
      currency: data.currency,
      tenantId: data.tenantId,
      metadata: {
        ...(data.metadata ?? {}),
        planId: data.priceId,
        transactionTotal: data.transactionTotal,
        source: 'paddle_webhook',
        customRates: !!customRates,
        saleOwnerType: ownership.ownerType,
        saleOwnerId: resolvedAgentId,
        originalSellerAgentId: data.originalSellerAgentId ?? data.subscriptionAgentId ?? null,
        ownershipResolvedFrom,
        ownershipDiagnostics: ownership.diagnostics,
      },
    });
    if (!commissionResult.success || !commissionResult.data?.id) {
      return {
        success: false,
        error: commissionResult.error ?? 'Failed to create renewal commission',
      };
    }

    return {
      success: true,
      data: {
        kind: 'created',
        id: commissionResult.data.id,
      },
    };
  } catch (error) {
    console.error('Error creating renewal commission:', error);
    return { success: false, error: 'Failed to create renewal commission' };
  }
}
