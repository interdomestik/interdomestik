import { domainEvents } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { RecoveryInvariantEvidence } from './recovery-invariants';
import type { TransitionTx } from './transition';

type UpdatedRows = Array<{ id: string; lifecycleVersion: number }>;

export const authorizedRecoveryEvidence: RecoveryInvariantEvidence = {
  claimId: 'claim-1',
  legalActionCapPercentage: 25,
  paymentAuthorizationState: 'authorized',
  signedAt: new Date('2026-03-12T09:00:00Z'),
};

export function makeTransitionTx(options: {
  current?: { id: string; lifecycleVersion: number; status: ClaimStatus | null };
  evidence?: RecoveryInvariantEvidence | null;
  updated?: UpdatedRows | (() => UpdatedRows);
}) {
  const calls: {
    eventValues?: unknown;
    historyValues?: unknown;
    updateValues?: Record<string, unknown>;
    whereConditions: unknown[];
  } = { whereConditions: [] };
  const tx = {
    select: () => ({
      from: () => {
        const selectState = { joined: false };
        const step = {
          leftJoin: () => {
            selectState.joined = true;
            return step;
          },
          where: (condition: unknown) => {
            calls.whereConditions.push(condition);
            return {
              limit: async () => {
                if (!selectState.joined) return options.current ? [options.current] : [];
                if (!options.current) return [];

                const evidence =
                  options.evidence === null ? {} : (options.evidence ?? authorizedRecoveryEvidence);

                return [
                  {
                    claimId: options.current.id,
                    lifecycleVersion: options.current.lifecycleVersion,
                    status: options.current.status,
                    ...evidence,
                  },
                ];
              },
            };
          },
        };
        return step;
      },
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        calls.updateValues = values;
        return {
          where: (condition: unknown) => {
            calls.whereConditions.push(condition);
            return {
              returning: async () =>
                typeof options.updated === 'function' ? options.updated() : (options.updated ?? []),
            };
          },
        };
      },
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>) => {
        if (table === domainEvents) calls.eventValues = values;
        else calls.historyValues = values;
        return { returning: async () => [{ id: values.id }] };
      },
    }),
  };

  return { calls, tx: tx as unknown as TransitionTx };
}
