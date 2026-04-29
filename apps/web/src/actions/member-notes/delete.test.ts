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

  function mockExistingNote(authorId: string): void {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => [{ id: 'note-1', authorId, tenantId: 'tenant-1', memberId: 'm1' }]),
        })),
      })),
    } as never);
  }

  const mockAdminSession = {
    user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' },
  };

  const mockStaffSession = {
    user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
  };

  it('allows author to delete their own note', async () => {
    mockExistingNote('staff-1');

    const result = await deleteMemberNoteCore({
      session: mockStaffSession as never,
      noteId: 'note-1',
    });

    expect(result.success).toBe(true);
    expect(db.delete).toHaveBeenCalled();
  });

  it("prevents staff from deleting another staff member's note", async () => {
    mockExistingNote('other-staff');

    const result = await deleteMemberNoteCore({
      session: mockStaffSession as never,
      noteId: 'note-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('You can only delete your own notes');
  });

  it('allows admin to delete any note', async () => {
    mockExistingNote('staff-1');

    const result = await deleteMemberNoteCore({
      session: mockAdminSession as never,
      noteId: 'note-1',
    });

    expect(result.success).toBe(true);
    expect(db.delete).toHaveBeenCalled();
  });
});
