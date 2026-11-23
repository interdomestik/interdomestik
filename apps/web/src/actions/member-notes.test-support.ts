// Shared fixtures for the member-notes action tests (vi.mock stays in each test file).

export const AGENT = { id: 'agent-a', role: 'agent', tenantId: 'tenant-a', name: 'Agent A' };
export const STAFF = { id: 'staff-s', role: 'staff', tenantId: 'tenant-a', name: 'Staff S' };
export const ADMIN = { id: 'admin-d', role: 'admin', tenantId: 'tenant-a', name: 'Admin D' };

export const NOTE = {
  id: 'note-1',
  memberId: 'member-1',
  authorId: 'agent-a',
  authorName: 'Agent A',
  type: 'general',
  content: 'hello',
  isPinned: false,
  isInternal: true,
  followUpDate: null,
  createdAt: new Date('2026-11-23T08:00:00Z'),
  updatedAt: null,
};
