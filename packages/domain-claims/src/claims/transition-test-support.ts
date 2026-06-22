import { inspect } from 'node:util';

import { domainEvents } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import { mapClaimStatusToLifecycleStates } from './lifecycle-state';
import type { RecoveryInvariantEvidence } from './recovery-invariants';
import type { TransitionTx } from './transition';

type UpdatedRows = Array<{ id: string; lifecycleVersion: number }>;
type CurrentFixture = {
  id: string;
  lifecycleVersion: number;
  status?: ClaimStatus | null;
  caseLifecycleState?: string | null;
  recoveryLifecycleState?: string | null;
};
type TransitionTxOptions = {
  current?: CurrentFixture;
  evidence?: RecoveryInvariantEvidence | null;
  updated?: UpdatedRows | (() => UpdatedRows);
};
type TransitionTxCalls = {
  executedSql: string[];
  eventWriteCount: number;
  eventValues?: unknown;
  historyWriteCount: number;
  historyValues?: unknown;
  operations: string[];
  updateValues?: Record<string, unknown>;
  whereConditions: unknown[];
};

export const authorizedRecoveryEvidence: RecoveryInvariantEvidence = {
  claimId: 'claim-1',
  legalActionCapPercentage: 25,
  paymentAuthorizationState: 'authorized',
  signedAt: new Date('2026-03-12T09:00:00Z'),
};

function withLifecycleStateDefaults(current: CurrentFixture): CurrentFixture {
  if (current.caseLifecycleState !== undefined || current.recoveryLifecycleState !== undefined) {
    return current;
  }
  if (!current.status) return current;
  return { ...current, ...mapClaimStatusToLifecycleStates(current.status) };
}

class FakeSelect {
  constructor(
    private readonly options: TransitionTxOptions,
    private readonly calls: TransitionTxCalls
  ) {}
  from(): this {
    return this;
  }
  leftJoin(): this {
    return this;
  }
  where(condition: unknown): this {
    this.calls.whereConditions.push(condition);
    return this;
  }
  async limit(): Promise<Record<string, unknown>[]> {
    if (!this.options.current) return [];
    this.calls.operations.push('select:current');
    return [withLifecycleStateDefaults(this.options.current)];
  }
}

class FakeUpdate {
  private values: Record<string, unknown> = {};
  constructor(
    private readonly options: TransitionTxOptions,
    private readonly calls: TransitionTxCalls
  ) {}
  set(values: Record<string, unknown>): this {
    this.values = values;
    this.calls.updateValues = values;
    this.calls.operations.push('update:claim');
    return this;
  }
  where(condition: unknown): this {
    this.calls.whereConditions.push(condition);
    return this;
  }
  async returning(): Promise<UpdatedRows> {
    return typeof this.options.updated === 'function'
      ? this.options.updated()
      : (this.options.updated ?? []);
  }
}

class FakeInsert {
  constructor(
    private readonly table: unknown,
    private readonly calls: TransitionTxCalls
  ) {}
  values(values: Record<string, unknown>) {
    if (this.table === domainEvents) {
      this.calls.eventValues = values;
      this.calls.eventWriteCount += 1;
      this.calls.operations.push('insert:event');
    } else {
      this.calls.historyValues = values;
      this.calls.historyWriteCount += 1;
      this.calls.operations.push('insert:history');
    }
    return { returning: async () => [{ id: values.id }] };
  }
}

export function makeTransitionTx(options: TransitionTxOptions) {
  const calls: TransitionTxCalls = {
    eventWriteCount: 0,
    executedSql: [],
    historyWriteCount: 0,
    operations: [],
    whereConditions: [],
  };
  const evidence =
    options.evidence === null ? null : (options.evidence ?? authorizedRecoveryEvidence);
  const tx = {
    execute: async (query: unknown) => {
      const rendered = String(inspect(query, { depth: 20 }));
      calls.executedSql.push(rendered);
      if (rendered.includes('claim_escalation_agreements')) {
        calls.operations.push('lock:agreement');
        return evidence ? [evidence] : [];
      }
      if (rendered.includes('claim_recovery_no_fee_evidence')) {
        calls.operations.push('lock:no-fee');
        return evidence?.noFeeReasonCode ? [evidence] : [];
      }
      return [];
    },
    insert: (table: unknown) => new FakeInsert(table, calls),
    select: () => new FakeSelect(options, calls),
    update: () => new FakeUpdate(options, calls),
  };

  return { calls, tx: tx as unknown as TransitionTx };
}
