import { beforeEach, vi, type Mock } from 'vitest';

const hoisted: {
  and: Mock;
  eq: Mock;
  isNull: Mock;
  lt: Mock;
  or: Mock;
  insert: Mock;
  insertValues: Mock;
  insertReturning: Mock;
  findFirst: Mock;
  onConflictDoNothing: Mock;
  set: Mock;
  update: Mock;
  updateReturning: Mock;
  where: Mock;
} = vi.hoisted(() => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions, op: 'and' })),
  eq: vi.fn((left: unknown, right: unknown) => ({ left, op: 'eq', right })),
  isNull: vi.fn(value => ({ op: 'isNull', value })),
  lt: vi.fn((left: unknown, right: unknown) => ({ left, op: 'lt', right })),
  or: vi.fn((...conditions: unknown[]) => ({ conditions, op: 'or' })),
  insert: vi.fn(),
  insertValues: vi.fn(),
  insertReturning: vi.fn(),
  findFirst: vi.fn(),
  onConflictDoNothing: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  updateReturning: vi.fn(),
  where: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  eq: hoisted.eq,
  isNull: hoisted.isNull,
  lt: hoisted.lt,
  or: hoisted.or,
}));

vi.mock('@interdomestik/database', () => ({
  db: {
    insert: hoisted.insert,
    query: {
      webhookEvents: {
        findFirst: hoisted.findFirst,
      },
    },
    update: hoisted.update,
  },
  webhookEvents: {
    id: 'id_col',
    dedupeKey: 'dedupe_key_col',
    error: 'error_col',
    eventType: 'event_type_col',
    payloadHash: 'payload_hash_col',
    processedAt: 'processed_at_col',
    processingResult: 'processing_result_col',
    processingScopeKey: 'processing_scope_key_col',
    providerTransactionId: 'provider_transaction_id_col',
    signatureValid: 'signature_valid_col',
    receivedAt: 'received_at_col',
  },
}));

beforeEach(() => {
  vi.clearAllMocks();

  hoisted.findFirst.mockResolvedValue(undefined);
  hoisted.insertReturning.mockResolvedValue([{ id: 'we_1' }]);
  hoisted.updateReturning.mockResolvedValue([]);
  hoisted.onConflictDoNothing.mockReturnValue({
    returning: hoisted.insertReturning,
  });
  hoisted.insertValues.mockReturnValue({
    onConflictDoNothing: hoisted.onConflictDoNothing,
  });
  hoisted.insert.mockReturnValue({
    values: hoisted.insertValues,
  });
  hoisted.where.mockReturnValue({ returning: hoisted.updateReturning });
  hoisted.set.mockReturnValue({ where: hoisted.where });
  hoisted.update.mockReturnValue({ set: hoisted.set });
});

export { hoisted };
