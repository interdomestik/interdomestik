import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { vi, type Mock } from 'vitest';

// Matches Vitest's own Procedure so typed mocks stay callable and assignable like inferred ones.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MockFunction = Mock<(...args: any[]) => any>;

export const authority: TenantAuthority = mintTestTenantAuthority('tenant-1');

type MocksMocks = {
  delete: MockFunction;
  deleteWhere: MockFunction;
  findFirst: MockFunction;
  insertValues: MockFunction;
  insert: MockFunction;
  onConflictDoNothing: MockFunction;
  dbMock: {
    query: {
      user: {
        findFirst: MockFunction;
      };
    };
    delete: MockFunction;
    insert: MockFunction;
  };
  withTenant: MockFunction;
  withTenantContext: MockFunction;
};

const mocks: MocksMocks = vi.hoisted(() => {
  const findFirst = vi.fn();
  const del = vi.fn();
  const insert = vi.fn();
  return {
    delete: del,
    deleteWhere: vi.fn(),
    findFirst,
    insertValues: vi.fn(),
    insert,
    onConflictDoNothing: vi.fn(),
    dbMock: { query: { user: { findFirst } }, delete: del, insert },
    withTenant: vi.fn(() => ({ scoped: true })),
    withTenantContext: vi.fn(),
  };
});

mocks.insert.mockReturnValue({ values: mocks.insertValues });

mocks.withTenantContext.mockImplementation(
  async (_context: unknown, callback: (tx: unknown) => unknown) => await callback(mocks.dbMock)
);

vi.mock('@interdomestik/database', () => ({
  db: mocks.dbMock,
  withTenantContext: mocks.withTenantContext,
}));

vi.mock('@interdomestik/database/schema', () => ({
  notifications: {
    id: 'notifications.id',
    tenantId: 'notifications.tenant_id',
    type: 'notifications.type',
    userId: 'notifications.user_id',
  },
}));

vi.mock('@interdomestik/database/tenant-security', () => ({
  withTenant: mocks.withTenant,
}));

vi.mock('../email', () => ({
  sendClaimAssignedEmail: vi.fn(),
  sendClaimSubmittedEmail: vi.fn(),
  sendEmail: vi.fn().mockResolvedValue({ success: true, id: 'email-1' }),
  sendNewMessageEmail: vi.fn(),
  sendPaymentVerificationEmail: vi.fn(),
  sendStatusChangedEmail: vi.fn(),
}));

export { mocks };
