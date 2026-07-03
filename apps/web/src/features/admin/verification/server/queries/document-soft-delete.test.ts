import { beforeEach, describe, expect, it, vi } from 'vitest';
const hoisted = vi.hoisted(() => ({
  aliasedTable: vi.fn(() => ({ name: 'verifier.name' })),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  asc: vi.fn((field: unknown) => ({ op: 'asc', field })),
  desc: vi.fn((field: unknown) => ({ op: 'desc', field })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  ilike: vi.fn(),
  inArray: vi.fn((left: unknown, right: unknown) => ({ op: 'inArray', left, right })),
  isNull: vi.fn((field: unknown) => ({ op: 'isNull', field })),
  or: vi.fn(),
  select: vi.fn(),
  sql: vi.fn(() => null),
}));

vi.mock('drizzle-orm', () => ({
  aliasedTable: hoisted.aliasedTable,
  and: hoisted.and,
  asc: hoisted.asc,
  desc: hoisted.desc,
  eq: hoisted.eq,
  ilike: hoisted.ilike,
  inArray: hoisted.inArray,
  isNull: hoisted.isNull,
  or: hoisted.or,
  sql: hoisted.sql,
}));

vi.mock('@interdomestik/database', () => ({ db: { select: hoisted.select } }));

vi.mock('@interdomestik/database/schema', () => ({
  auditLog: {
    action: 'audit.action',
    actorId: 'audit.actor_id',
    createdAt: 'audit.created_at',
    entityId: 'audit.entity_id',
    entityType: 'audit.entity_type',
    id: 'audit.id',
    metadata: 'audit.metadata',
    tenantId: 'audit.tenant_id',
  },
  branches: { code: 'branches.code', id: 'branches.id', name: 'branches.name' },
  documents: {
    deletedAt: 'documents.deleted_at',
    entityId: 'documents.entity_id',
    entityType: 'documents.entity_type',
    id: 'documents.id',
    storagePath: 'documents.storage_path',
    tenantId: 'documents.tenant_id',
    uploadedAt: 'documents.uploaded_at',
  },
  user: { email: 'user.email', id: 'user.id', name: 'user.name' },
}));

vi.mock('@interdomestik/database/schema/leads', () => ({
  leadPaymentAttempts: {
    amount: 'attempt.amount',
    createdAt: 'attempt.created_at',
    currency: 'attempt.currency',
    id: 'attempt.id',
    isResubmission: 'attempt.is_resubmission',
    leadId: 'attempt.lead_id',
    method: 'attempt.method',
    status: 'attempt.status',
    tenantId: 'attempt.tenant_id',
    updatedAt: 'attempt.updated_at',
    verificationNote: 'attempt.note',
    verifiedBy: 'attempt.verified_by',
  },
  memberLeads: {
    agentId: 'lead.agent_id',
    branchId: 'lead.branch_id',
    email: 'lead.email',
    firstName: 'lead.first_name',
    id: 'lead.id',
    lastName: 'lead.last_name',
  },
}));

import { getVerificationRequestDetails } from './get-details';
import { getVerificationRequests } from './get-requests';
function chain(result: unknown, terminalWhere = false) {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    leftJoin: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
    orderBy: vi.fn().mockResolvedValue(result),
    where: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.leftJoin.mockReturnValue(query);
  query.where.mockReturnValue(terminalWhere ? Promise.resolve(result) : query);
  query.orderBy.mockReturnValue(query);
  return query;
}
const ctx = {
  scope: {},
  tenantId: 'tenant-ks',
  userRole: 'admin',
} as never;

describe('verification payment proof document lifecycle filters', () => {
  beforeEach(vi.clearAllMocks);

  it('filters soft-deleted payment proof documents from request joins', async () => {
    const requestsQuery = chain([]);
    hoisted.select.mockReturnValueOnce(requestsQuery);

    await getVerificationRequests(ctx, { view: 'queue' });

    expect(requestsQuery.leftJoin).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        args: expect.arrayContaining([
          expect.objectContaining({ field: 'documents.deleted_at', op: 'isNull' }),
        ]),
      })
    );
  });

  it('filters soft-deleted payment proof documents from detail document lists', async () => {
    const row = {
      agentName: 'Agent',
      createdAt: new Date('2026-01-01T00:00:00Z'),
      id: 'attempt-1',
    };
    const detailQuery = chain([row], true);
    const docsQuery = chain([]);
    const logsQuery = chain([]);
    docsQuery.orderBy.mockResolvedValue([]);
    logsQuery.orderBy.mockResolvedValue([]);
    hoisted.select.mockReturnValueOnce(detailQuery);
    hoisted.select.mockReturnValueOnce(docsQuery);
    hoisted.select.mockReturnValueOnce(logsQuery);

    await getVerificationRequestDetails(ctx, 'attempt-1');

    expect(docsQuery.where).toHaveBeenCalledWith(
      expect.objectContaining({
        args: expect.arrayContaining([
          expect.objectContaining({ field: 'documents.deleted_at', op: 'isNull' }),
        ]),
      })
    );
  });
});
