import { db, withTenantContext } from '@interdomestik/database';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemberNoteCore } from './create.core';

// Mock dependencies
vi.mock('@interdomestik/database', () => {
  const db = {
    insert: vi.fn(() => ({
      values: vi.fn(),
    })),
  };
  return {
    db,
    withTenantContext: vi.fn(
      async (_context: unknown, action: (tx: typeof db) => Promise<unknown>) => action(db)
    ),
  };
});

vi.mock('@interdomestik/database/schema', () => ({
  memberNotes: {},
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('nanoid', () => ({
  nanoid: vi.fn(() => 'new-note-id'),
}));

vi.mock('./access', () => ({
  canAccessNotes: vi.fn(role => role === 'admin' || role === 'staff'),
}));

// Mock @/lib/audit
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

const authority = mintTestTenantAuthority('tenant-1');

describe('createMemberNoteCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAdminSession = {
    user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1', name: 'Admin' },
  };

  const mockMemberSession = {
    user: { id: 'member-1', role: 'member', tenantId: 'tenant-1' },
  };

  it('denies access for member role', async () => {
    const result = await createMemberNoteCore({
      session: mockMemberSession as never,
      authority,
      data: {
        memberId: 'target-member',
        content: 'Should fail',
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Access denied');
  });

  it('sanitizes content and creates note for admin', async () => {
    const result = await createMemberNoteCore({
      session: mockAdminSession as never,
      authority,
      data: {
        memberId: 'target-member',
        content: '<script>alert()</script>Valid Content',
        type: 'general',
      },
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data?.content).toBe('alert()Valid Content'); // sanitized (tags stripped)
      expect(result.data?.type).toBe('general');
    }
    expect(withTenantContext).toHaveBeenCalledWith(authority, expect.any(Function));
    expect(db.insert).toHaveBeenCalled();
  });
});
