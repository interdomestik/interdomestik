import type { CrmActorContext } from '../context';
import type { CrmLossReason } from './types';

export type ResolveCrmLossReasonInput = {
  actor: CrmActorContext;
  lossReasonId: string;
};

export interface LossReasonResolver {
  resolveLossReason(
    input: ResolveCrmLossReasonInput
  ): Promise<Pick<CrmLossReason, 'code' | 'id'> | null>;
}

export function staticLossReasonResolver(reasons: readonly CrmLossReason[]): LossReasonResolver {
  return {
    async resolveLossReason(input: ResolveCrmLossReasonInput) {
      const reason =
        reasons.find(
          candidate =>
            candidate.id === input.lossReasonId && candidate.tenantId === input.actor.tenantId
        ) ?? null;
      return reason ? { code: reason.code, id: reason.id } : null;
    },
  };
}
