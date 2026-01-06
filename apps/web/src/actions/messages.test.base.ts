import { vi } from 'vitest';

// Hoisted mocks must be defined before vi.mock calls
const hoistedMocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  dbQuery: vi.fn(),
  dbUserQuery: vi.fn(),
  dbInsert: vi.fn(),
  dbUpdate: vi.fn(),
}));

export const mocks = hoistedMocks;

export const mockSelectChain = {
  from: vi.fn().mockReturnThis(),
  leftJoin: vi.fn().mockReturnThis(),
  where: vi.fn().mockReturnThis(),
  orderBy: vi.fn().mockReturnValue([]),
  limit: vi.fn().mockReturnValue([]),
};

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoistedMocks.getSession,
    },
  },
}));

vi.mock('@interdomestik/database', () => ({
  claimMessages: {
    id: { name: 'id' },
    claimId: { name: 'claim_id' },
    senderId: { name: 'sender_id' },
    content: { name: 'content' },
    isInternal: { name: 'is_internal' },
    readAt: { name: 'read_at' },
    createdAt: { name: 'created_at' },
    tenantId: { name: 'tenant_id' },
  },
  claims: { id: { name: 'id' }, userId: { name: 'userId' }, tenantId: { name: 'tenantId' } },
  user: {
    id: { name: 'id' },
    name: { name: 'name' },
    image: { name: 'image' },
    role: { name: 'role' },
    tenantId: { name: 'tenantId' },
  },
  db: {
    select: () => mockSelectChain,
    insert: () => ({ values: hoistedMocks.dbInsert }),
    update: () => ({
      set: () => ({
        where: hoistedMocks.dbUpdate,
      }),
    }),
    query: {
      claims: {
        findFirst: () => hoistedMocks.dbQuery(),
      },
      user: {
        findFirst: () => hoistedMocks.dbUserQuery(),
      },
    },
  },
}));

vi.mock('nanoid', () => ({
  nanoid: () => 'test-message-id',
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

vi.mock('@/lib/notifications', () => ({
  notifyNewMessage: vi.fn().mockResolvedValue({ success: true }),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
  inArray: vi.fn(),
}));

export const resetMocks = () => {
  vi.clearAllMocks();
  mockSelectChain.from.mockReturnThis();
  mockSelectChain.leftJoin.mockReturnThis();
  mockSelectChain.where.mockReturnThis();
  mockSelectChain.orderBy.mockReturnValue([]);
  mockSelectChain.limit.mockReturnValue([]);
};
