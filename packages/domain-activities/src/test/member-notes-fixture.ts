import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

import { store } from './member-notes-db';

// Shared seed and actors for the member-notes unit tests. The rows mirror the restricted-role
// proof (packages/database/test/member-notes-restricted-rls.test.ts) with short ids.

// The descriptor registry, as in the database module: an unknown token is no authority. Session
// authorities are minted only by the request path; the restricted-role proof mints real ones.
const authorities = new WeakMap<object, unknown>();

/** The mocked `readTenantAuthority`. */
export function readFakeAuthority(token: object): unknown {
  const descriptor = authorities.get(token);
  if (!descriptor) throw new Error('Unknown tenant authority');
  return descriptor;
}

function mintAuthority(descriptor: {
  tenantId: string;
  accessTenantId: string;
  purpose: 'session' | 'test';
  principal: { userId: string; role: string | null; branchId: null; agentId: null } | null;
}): TenantAuthority {
  const token = Object.freeze(Object.create(null)) as TenantAuthority;
  authorities.set(token, Object.freeze({ ...descriptor, expiresAtMs: Number.MAX_SAFE_INTEGER }));
  return token;
}

export const KS = 'tenant_ks';
export const MK = 'tenant_mk';

type Principal = { userId: string; role: string | null } | null;

export type ActorPair = {
  session: { user: { id: string; role: string; tenantId: string | null; name: string } };
  authority: TenantAuthority;
};

/** A session and the session authority minted from it, as authorizeSessionTenant pairs them. */
export function actor(
  userId: string,
  role: string,
  overrides: {
    tenantId?: string;
    sessionTenantId?: string | null;
    accessTenantId?: string;
    purpose?: 'session' | 'test';
    principal?: Principal;
    sessionRole?: string;
  } = {}
): ActorPair {
  const tenantId = overrides.tenantId ?? KS;
  const principal =
    overrides.principal === undefined ? { userId, role } : (overrides.principal as Principal);
  return {
    session: {
      user: {
        id: userId,
        role: overrides.sessionRole ?? role,
        tenantId: overrides.sessionTenantId === undefined ? tenantId : overrides.sessionTenantId,
        name: `Name ${userId}`,
      },
    },
    authority: mintAuthority({
      tenantId,
      accessTenantId: overrides.accessTenantId ?? tenantId,
      purpose: overrides.purpose ?? 'session',
      principal: principal ? { ...principal, branchId: null, agentId: null } : null,
    }),
  };
}

export const A = () => actor('agent_a', 'agent');
export const B = () => actor('agent_b', 'agent');
export const S = () => actor('staff_s', 'staff');
export const D = () => actor('admin_d', 'admin');

export const at = (minute: number) => new Date(Date.UTC(2026, 10, 23, 8, minute));

function note(id: string, memberId: string, authorId: string, minute: number, tenantId = KS) {
  return {
    id,
    tenantId,
    memberId,
    authorId,
    type: 'general',
    content: `content ${id}`,
    isPinned: false,
    isInternal: true,
    followUpDate: null,
    createdAt: at(minute),
    updatedAt: null,
  };
}

export function seed() {
  store.reset();
  const person = (id: string, role: string, tenantId = KS, agentId: string | null = null) => ({
    id,
    tenantId,
    role,
    name: `Name ${id}`,
    agentId,
  });
  store.rows.user.push(
    person('agent_a', 'agent'),
    person('agent_b', 'agent'),
    person('staff_s', 'staff'),
    person('admin_d', 'admin'),
    person('staff_t', 'staff'),
    person('m1', 'member'),
    person('m2', 'user'),
    person('m3', 'member'),
    person('m4', 'member'),
    person('m6', 'member', KS, 'agent_a'),
    person('mk1', 'member', MK)
  );
  const link = (agentId: string, memberId: string, status: string, tenantId = KS) => ({
    id: `ac_${agentId}_${memberId}`,
    tenantId,
    agentId,
    memberId,
    status,
  });
  store.rows.agentClients.push(
    link('agent_a', 'm1', 'active'),
    link('agent_a', 'm2', 'active'),
    link('agent_a', 'm3', 'inactive'),
    link('agent_b', 'm4', 'active'),
    link('agent_a', 'm6', 'inactive'),
    link('agent_b', 'm6', 'active'),
    // An assignment to a non-member account: the member-account check alone must refuse it.
    link('agent_a', 'staff_t', 'active')
  );
  store.rows.memberNotes.push(
    note('n1', 'm1', 'agent_a', 1),
    note('n2', 'm1', 'staff_s', 2),
    note('n3', 'm4', 'agent_b', 3),
    note('n6', 'm6', 'agent_b', 4),
    note('n8', 'm6', 'agent_a', 5),
    note('n9', 'm3', 'agent_a', 6),
    note('nt', 'staff_t', 'admin_d', 7),
    // Malformed: a KS note naming the MK member.
    note('n7', 'mk1', 'staff_s', 8),
    note('nm', 'mk1', 'agent_mk', 9, MK)
  );
}

export const notesSnapshot = () => structuredClone(store.rows.memberNotes);
export const DENIED_ROLES = [
  'member',
  'user',
  'branch_manager',
  'tenant_admin',
  'super_admin',
  'promoter',
  'auditor',
  'global_support',
  'unknown_role',
];
