import type { TestContext } from 'node:test';

import { and, eq, inArray } from 'drizzle-orm';

import { agentClients, memberNotes } from '../src/schema';
import type { TenantAuthority } from '../src/tenant-authority';
import {
  grantTablePrivileges,
  openActivitySession,
  withCleanup,
  type Cleanups,
} from './activity-access-rls.support';
import {
  cleanupNotes,
  NOTE_GRANTS,
  noteSeedIds,
  seedNotes,
} from './member-notes-restricted-rls.support';
import { KS_TENANT_ID, type S8RestrictedSession } from './s8-claim-restricted-rls.fixture';

// One restricted-role session per proof file: the R-13 target check, grants revoked afterwards,
// the seed of the support file, the real domain modules, session actors, and cleanup that runs
// whatever the subtests did (#2113's helpers, R-20).

type Overrides = {
  purpose?: 'session' | 'test';
  authorityTenant?: string;
  principalUser?: string;
  principalRole?: string;
  sessionTenant?: string;
};

async function loadModules() {
  const [commands, change, access, ctx, authority] = await Promise.all([
    import('../../domain-activities/src/member-notes'),
    import('../../domain-activities/src/member-notes/change'),
    import('../../domain-activities/src/member-notes/access'),
    import('../src/tenant-authority-context'),
    import('../src/tenant-authority'),
  ]);
  return { commands, change, access, ctx, mintTenantAuthority: authority.mintTenantAuthority };
}

async function buildProof(session: S8RestrictedSession, seed: ReturnType<typeof noteSeedIds>) {
  const { adminDb } = session;
  const modules = await loadModules();
  /** A session and a session authority minted for it, as the request path pairs them. */
  const actor = (userId: string, role: string, overrides: Overrides = {}) => {
    const tenantId = overrides.authorityTenant ?? KS_TENANT_ID;
    const authority: TenantAuthority = modules.mintTenantAuthority({
      tenantId,
      accessTenantId: tenantId,
      purpose: overrides.purpose ?? 'session',
      principal: {
        userId: overrides.principalUser ?? userId,
        role: overrides.principalRole ?? role,
        branchId: null,
        agentId: null,
      },
    });
    return {
      session: {
        user: { id: userId, role, tenantId: overrides.sessionTenant ?? KS_TENANT_ID, name: role },
      },
      authority,
    };
  };
  const u = seed.users;
  const allNoteIds = [...Object.values(seed.notes)];
  return {
    ...modules,
    adminDb,
    seed,
    u,
    n: seed.notes,
    actor,
    A: () => actor(u.agentA, 'agent'),
    B: () => actor(u.agentB, 'agent'),
    C: () => actor(u.agentC, 'agent'),
    S: () => actor(u.staffS, 'staff'),
    D: () => actor(u.adminD, 'admin'),
    allNoteIds,
    snapshot: () =>
      adminDb
        .select()
        .from(memberNotes)
        .where(inArray(memberNotes.id, allNoteIds))
        .orderBy(memberNotes.id),
    ids: (result: { ok: boolean; data?: unknown }) =>
      result.ok ? (result.data as { id: string }[]).map(row => row.id) : result,
    setAssignment: (agentId: string, memberId: string, status: string) =>
      adminDb
        .update(agentClients)
        .set({ status })
        .where(and(eq(agentClients.agentId, agentId), eq(agentClients.memberId, memberId))),
  };
}

export type NotesProof = Awaited<ReturnType<typeof buildProof>>;

export async function withNotesProof(
  t: TestContext,
  body: (proof: NotesProof) => Promise<void>
): Promise<void> {
  // Four app connections: a race holds one command, probes it from another, and runs a second.
  const session = await openActivitySession(t, { DB_MAX_CONNECTIONS: '4' });
  if (!session) return;
  const seed = noteSeedIds(session.fixture.newId);
  let revoke: (() => Promise<void>) | null = null;
  // Registered before the first write: rows first, then the grants, then the clients.
  const cleanups: Cleanups = [
    () => cleanupNotes(session.adminDb, seed),
    async () => revoke?.(),
    () => session.close(),
  ];
  await withCleanup(
    t,
    async () => {
      revoke = await grantTablePrivileges(session.adminDb, NOTE_GRANTS);
      await seedNotes(session.adminDb, seed);
      await body(await buildProof(session, seed));
    },
    () => cleanups
  );
}
