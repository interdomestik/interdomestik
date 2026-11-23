import type { TestContext } from 'node:test';
import { inspect } from 'node:util';

import { and, eq, inArray } from 'drizzle-orm';

import { agentClients, memberNotes } from '../src/schema';
import type { TenantAuthority } from '../src/tenant-authority';
import {
  cleanupNotes,
  grantNoteTables,
  noteSeedIds,
  seedNotes,
} from './member-notes-restricted-rls.support';
import { KS_TENANT_ID, openS8RestrictedSession } from './s8-claim-restricted-rls.fixture';

// One restricted-role session per proof file: grants, the seed of the support file, the real
// domain modules, session actors, and cleanup that runs whatever the subtests did.

type Overrides = {
  purpose?: 'session' | 'test';
  authorityTenant?: string;
  principalUser?: string;
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

async function buildProof(
  session: NonNullable<Awaited<ReturnType<typeof openS8RestrictedSession>>>,
  seed: ReturnType<typeof noteSeedIds>
) {
  const { adminDb } = session;
  const modules = await loadModules();
  /** A session and a session authority minted for it, as the request path pairs them. */
  const actor = (userId: string, role: string, overrides: Overrides = {}) => {
    const tenantId = overrides.authorityTenant ?? KS_TENANT_ID;
    const authority: TenantAuthority = modules.mintTenantAuthority({
      tenantId,
      accessTenantId: tenantId,
      purpose: overrides.purpose ?? 'session',
      principal: { userId: overrides.principalUser ?? userId, role, branchId: null, agentId: null },
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
    databaseUrl: process.env.DATABASE_URL ?? '',
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
  const session = await openS8RestrictedSession(t);
  if (!session) return;
  const seed = noteSeedIds(session.fixture.newId);
  const failures: unknown[] = [];
  try {
    await grantNoteTables(session.adminDb);
    await seedNotes(session.adminDb, seed);
    await body(await buildProof(session, seed));
  } catch (error) {
    failures.push(error);
  } finally {
    for (const cleanup of [() => cleanupNotes(session.adminDb, seed), () => session.close()]) {
      try {
        await cleanup();
      } catch (error) {
        failures.push(error);
      }
    }
  }
  for (const error of failures.slice(1)) {
    t.diagnostic(`Additional cleanup failure: ${inspect(error)}`);
  }
  if (failures.length > 0) throw failures[0];
}
