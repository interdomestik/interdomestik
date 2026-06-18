import { domainEvents } from '@interdomestik/database';
import type { ClaimStatus } from '@interdomestik/database/constants';
import type { RecoveryInvariantEvidence } from './recovery-invariants';
import type { TransitionTx } from './transition';

type UpdatedRows = Array<{ id: string; lifecycleVersion: number }>;
type TransitionTxOptions = {
  current?: { id: string; lifecycleVersion: number; status: ClaimStatus | null };
  evidence?: RecoveryInvariantEvidence | null;
  updated?: UpdatedRows | (() => UpdatedRows);
};
type TransitionTxCalls = {
  eventValues?: unknown;
  historyValues?: unknown;
  updateValues?: Record<string, unknown>;
  whereConditions: unknown[];
};

export const authorizedRecoveryEvidence: RecoveryInvariantEvidence = {
  claimId: 'claim-1',
  legalActionCapPercentage: 25,
  paymentAuthorizationState: 'authorized',
  signedAt: new Date('2026-03-12T09:00:00Z'),
};

class FakeSelect {
  private joined = false;
  constructor(
    private readonly options: TransitionTxOptions,
    private readonly calls: TransitionTxCalls
  ) {}
  from(): this {
    return this;
  }
  leftJoin(): this {
    this.joined = true;
    return this;
  }
  where(condition: unknown): this {
    this.calls.whereConditions.push(condition);
    return this;
  }
  async limit(): Promise<Record<string, unknown>[]> {
    if (!this.joined) return this.options.current ? [this.options.current] : [];
    if (!this.options.current) return [];

    const evidence =
      this.options.evidence === null ? {} : (this.options.evidence ?? authorizedRecoveryEvidence);

    return [
      {
        claimId: this.options.current.id,
        lifecycleVersion: this.options.current.lifecycleVersion,
        status: this.options.current.status,
        ...evidence,
      },
    ];
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
    if (this.table === domainEvents) this.calls.eventValues = values;
    else this.calls.historyValues = values;
    return { returning: async () => [{ id: values.id }] };
  }
}

export function makeTransitionTx(options: TransitionTxOptions) {
  const calls: TransitionTxCalls = { whereConditions: [] };
  const tx = {
    insert: (table: unknown) => new FakeInsert(table, calls),
    select: () => new FakeSelect(options, calls),
    update: () => new FakeUpdate(options, calls),
  };

  return { calls, tx: tx as unknown as TransitionTx };
}
