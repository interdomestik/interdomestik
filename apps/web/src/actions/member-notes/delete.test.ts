import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteMemberNoteCore } from './delete.core';

// Mock dependencies
vi.mock('@interdomestik/database', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  memberNotes: {
    id: 'id',
    tenantId: 'tenantId',
    authorId: 'authorId',
  },
}));

vi.mock('@interdomestik/shared-auth', () => ({
  ensureTenantId: vi.fn(() => 'tenant-1'),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock('./access', () => ({
  canAccessNotes: vi.fn(role => role === 'admin' || role === 'staff'),
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

describe('deleteMemberNoteCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAdminSession = {
    user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' },
  };

  const mockStaffSession = {
    user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
  };

  it('allows author to delete their own note', async () => {
    // Mock existing note owned by staff-1
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue([
              { id: 'note-1', authorId: 'staff-1', tenantId: 'tenant-1', memberId: 'm1' },
            ]),
        }),
      }),
    });

    const result = await deleteMemberNoteCore({
      session: mockStaffSession as any,
      noteId: 'note-1',
    });

    expect(result.success).toBe(true);
    expect(db.delete).toHaveBeenCalled();
  });

  it("prevents staff from deleting another staff member's note", async () => {
    // Mock existing note owned by other-staff
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue([
              { id: 'note-1', authorId: 'other-staff', tenantId: 'tenant-1', memberId: 'm1' },
            ]),
        }),
      }),
    });

    const result = await deleteMemberNoteCore({
      session: mockStaffSession as any,
      noteId: 'note-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('You can only delete your own notes');
  });

  it('allows admin to delete any note', async () => {
    // Mock existing note owned by staff-1
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi
            .fn()
            .mockReturnValue([
              { id: 'note-1', authorId: 'staff-1', tenantId: 'tenant-1', memberId: 'm1' },
            ]),
        }),
      }),
    });

    const result = await deleteMemberNoteCore({
      session: mockAdminSession as any,
      noteId: 'note-1',
    });

    expect(result.success).toBe(true);
    expect(db.delete).toHaveBeenCalled();
  });
});
