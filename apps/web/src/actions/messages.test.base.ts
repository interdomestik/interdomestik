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
      getSession: () => mocks.getSession(),
    },
  },
}));

vi.mock('@interdomestik/database', () => ({
  claimMessages: {
    id: 'id',
    claimId: 'claim_id',
    senderId: 'sender_id',
    content: 'content',
    isInternal: 'is_internal',
    readAt: 'read_at',
    createdAt: 'created_at',
  },
  claims: { id: 'id', userId: 'userId' },
  user: { id: 'id', name: 'name', image: 'image', role: 'role' },
  db: {
    select: () => mockSelectChain,
    insert: () => ({ values: mocks.dbInsert }),
    update: () => ({ set: () => ({ where: mocks.dbUpdate }) }),
    query: {
      claims: {
        findFirst: () => mocks.dbQuery(),
      },
      user: {
        findFirst: () => mocks.dbUserQuery(),
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

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
}));

export const resetMocks = () => {
  vi.clearAllMocks();
  mockSelectChain.from.mockReturnThis();
  mockSelectChain.leftJoin.mockReturnThis();
  mockSelectChain.where.mockReturnThis();
  mockSelectChain.orderBy.mockReturnValue([]);
  mockSelectChain.limit.mockReturnValue([]);
};
