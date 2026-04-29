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

  function mockCurrentNote(authorId: string): void {
    vi.mocked(db.select).mockReturnValueOnce({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => [{ id: 'note-1', authorId, tenantId: 'tenant-1', memberId: 'm1' }]),
        })),
      })),
    } as never);
  }

  function mockUpdatedNote(content: string): void {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn(() => ({
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(() => [{ id: 'note-1', content }]),
          })),
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

  it('allows author to update their own note', async () => {
    mockCurrentNote('staff-1');
    mockUpdatedNote('Updated');

    const result = await updateMemberNoteCore({
      session: mockStaffSession as never,
      data: { id: 'note-1', content: 'Updated' },
    });

    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });

  it("prevents staff from updating another staff member's note", async () => {
    mockCurrentNote('other-staff');

    const result = await updateMemberNoteCore({
      session: mockStaffSession as never,
      data: { id: 'note-1', content: 'Updated' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('You can only edit your own notes');
  });

  it('allows admin to update any note', async () => {
    mockCurrentNote('staff-1');
    mockUpdatedNote('Updated by Admin');

    const result = await updateMemberNoteCore({
      session: mockAdminSession as never,
      data: { id: 'note-1', content: 'Updated by Admin' },
    });

    expect(result.success).toBe(true);
    expect(db.update).toHaveBeenCalled();
  });
});
