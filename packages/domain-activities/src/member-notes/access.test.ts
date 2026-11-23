import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  A,
  B,
  D,
  DENIED_ROLES,
  KS,
  MK,
  S,
  actor,
  at,
  notesSnapshot,
  seed,
} from '../test/member-notes-fixture';
import { memberNoteActorOf, memberNoteScope } from './access';
import { sanitizeNoteContent } from './schema';

// The access rule reads only the authority registry; the database module is replaced so the real
// client is never loaded.
vi.mock('@interdomestik/database/tenant-authority', async () => ({
  readTenantAuthority: (await import('../test/member-notes-fixture')).readFakeAuthority,
}));
vi.mock(
  '@interdomestik/database',
  async () => (await import('../test/member-notes-db')).databaseModule
);

beforeEach(seed);

describe('memberNoteActorOf', () => {
  it('binds the actor to a matching session authority', () => {
    const { session, authority } = A();
    expect(memberNoteActorOf(session, authority)).toEqual({
      tenantId: KS,
      userId: 'agent_a',
      role: 'agent',
    });
  });

  it.each([
    ['a test authority', actor('agent_a', 'agent', { purpose: 'test' })],
    [
      'an unknown token',
      { ...actor('agent_a', 'agent'), authority: Object.freeze({}) as TenantAuthority },
    ],
    ['a missing principal', actor('agent_a', 'agent', { principal: null })],
    [
      'a principal without a role',
      actor('agent_a', 'agent', { principal: { userId: 'agent_a', role: null } }),
    ],
    [
      'another principal user',
      actor('agent_a', 'agent', { principal: { userId: 'agent_b', role: 'agent' } }),
    ],
    ['a padded session role', actor('agent_a', 'agent', { sessionRole: 'agent ' })],
    ['another session role', actor('agent_a', 'agent', { sessionRole: 'staff' })],
    ['another session tenant', actor('agent_a', 'agent', { sessionTenantId: MK })],
    ['a session without a tenant', actor('agent_a', 'agent', { sessionTenantId: null })],
    ['another access tenant', actor('agent_a', 'agent', { accessTenantId: MK })],
  ])('refuses %s', (_label, { session, authority }) => {
    expect(memberNoteActorOf(session, authority)).toBeNull();
  });
});

describe('memberNoteScope', () => {
  it('keeps the base allow-list: agent assigned, staff and admin tenant-wide', () => {
    expect(memberNoteScope('agent')).toBe('assigned');
    expect(memberNoteScope('staff')).toBe('tenant');
    expect(memberNoteScope('admin')).toBe('tenant');
  });

  it.each(DENIED_ROLES)('denies %s', role => {
    expect(memberNoteScope(role)).toBe('denied');
  });
});

describe('sanitizeNoteContent', () => {
  it.each([
    ['<script>alert()</script>Valid Content', 'alert()Valid Content'],
    ['  a < b and c > d  ', 'a  d'],
    ['unclosed <tag', 'unclosed <tag'],
    ['x'.repeat(2100), 'x'.repeat(2000)],
  ])('turns %j into %j', (raw, clean) => {
    expect(sanitizeNoteContent(raw)).toBe(clean);
  });
});
