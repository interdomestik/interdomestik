import { db } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { updateMemberNoteCore } from './update.core';

// Mock dependencies
vi.mock('@interdomestik/database', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => []),
        })),
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => []),
          })),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  memberNotes: {
    id: 'id',
    tenantId: 'tenantId',
    authorId: 'authorId',
  },
  user: {
    id: 'id',
    name: 'name',
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

vi.mock('./map', () => ({
  mapNoteRow: vi.fn(row => row),
}));

describe('updateMemberNoteCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAdminSession = {
    user: { id: 'admin-1', role: 'admin', tenantId: 'tenant-1' },
  };

  const mockStaffSession = {
    user: { id: 'staff-1', role: 'staff', tenantId: 'tenant-1' },
  };

  it('allows author to update their own note', async () => {
    // Mock existing note owned by staff-1
    (db.select as any).mockReturnValueOnce({
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

    // Mock return of updated note
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([{ id: 'note-1', content: 'Updated' }]),
          }),
        }),
      }),
    });

    const result = await updateMemberNoteCore({
      session: mockStaffSession as any,
      data: { id: 'note-1', content: 'Updated' },
    });

    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("prevents staff from updating another staff member's note", async () => {
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

    const result = await updateMemberNoteCore({
      session: mockStaffSession as any,
      data: { id: 'note-1', content: 'Updated' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('You can only edit your own notes');
  });

  it('allows admin to update any note', async () => {
    // Mock existing note owned by staff-1
    (db.select as any).mockReturnValueOnce({
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
    // Mock return of updated note
    (db.select as any).mockReturnValue({
      from: vi.fn().mockReturnValue({
        leftJoin: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue([{ id: 'note-1', content: 'Updated by Admin' }]),
          }),
        }),
      }),
    });

    const result = await updateMemberNoteCore({
      session: mockAdminSession as any,
      data: { id: 'note-1', content: 'Updated by Admin' },
    });

    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });
});
