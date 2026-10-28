import { memberNotes } from '@interdomestik/database/schema';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { count, sql } from 'drizzle-orm';
import assert from 'node:assert/strict';

import { getMemberNotesCore } from '../../../src/actions/member-notes/get.core';
import { getAgentClientProfileCore } from '../../../src/app/[locale]/(agent)/agent/clients/[id]/_core';
import type { AgentMessageFixture as Fixture } from '../agent-message-visibility.fixture';
import {
  assertEmptyProfile,
  assertMainProfile,
  assertNoForeignLeak,
  assertRightfulNotes,
  foreignChildIds,
  type NotesResult,
  type ProfileOk,
} from './agent-profile-notes-assertions';

type RlsDb = typeof import('@interdomestik/database').dbRls;
type Viewer = Parameters<typeof getAgentClientProfileCore>[0]['viewer'];
type NotesSession = Parameters<typeof getMemberNotesCore>[0]['session'];
type EnsureArg = Parameters<typeof ensureTenantId>[0];
type Counts = Record<string, number>;

const AGENT = 'agent';
const FORBIDDEN = { kind: 'forbidden' };
const ACCESS_DENIED = { success: false, error: 'Access denied' };
const PROFILE_DENIED_ROLES: unknown[] = [
  'member',
  'staff',
  'admin',
  'unknown',
  '',
  null,
  undefined,
];
const MISSING_TENANTS = ['', '  ', undefined, null];
const STAFF_FAMILY = ['staff', 'admin'];
const NOTES_DENIED_ROLES: unknown[] = [
  'member',
  'tenant_admin',
  'super_admin',
  'unknown',
  '',
  null,
  undefined,
];

const cast = <T>(value: object): T => value as unknown as T;
const asRows = (result: unknown): Record<string, unknown>[] =>
  Array.from(result as Iterable<Record<string, unknown>>);

async function assertGucReset(db: RlsDb, label: string): Promise<void> {
  const [row] = asRows(
    await db.execute(
      sql`select nullif(current_setting('app.current_tenant_id', true), '') as tenant, nullif(current_setting('app.current_access_tenant_id', true), '') as access, nullif(current_setting('app.user_role', true), '') as role`
    )
  );
  assert.deepEqual(row, { tenant: null, access: null, role: null }, `${label}: context leaked`);
}

async function rawNoteCount(db: RlsDb): Promise<number> {
  const [row] = await db.select({ n: count() }).from(memberNotes);
  return Number(row?.n ?? Number.NaN);
}

// Synthetic session: home tenant on the user, access tenant resolved first by ensureTenantId.
function sessionFor(id: string, role: unknown, home: string, access: string): object {
  return { user: { id, role, tenantId: home, accessTenantId: access } };
}

function effectiveTenant(id: string, home: string, access: string): string {
  const tenant = ensureTenantId(cast<EnsureArg>(sessionFor(id, AGENT, home, access))).trim();
  assert.equal(tenant, access, 'ensureTenantId must resolve the access tenant first');
  return tenant;
}

const profile = (memberId: string, viewer: Viewer) =>
  getAgentClientProfileCore({ memberId, viewer });

async function profileOk(memberId: string, viewer: Viewer): Promise<ProfileOk> {
  const result = await profile(memberId, viewer);
  if (result.kind !== 'ok') assert.fail(`profile read ${result.kind}`);
  return result;
}

async function runProfile(f: Fixture, db: RlsDb): Promise<Counts> {
  const agent: Viewer = { id: f.agentId, role: AGENT, tenantId: f.tenantId };
  const forbid = async (memberId: string, viewer: Viewer, label: string) =>
    assert.deepEqual(await profile(memberId, viewer), FORBIDDEN, label);

  const ok = await profileOk(f.memberId, agent);
  assertMainProfile(ok, f);
  assertNoForeignLeak(ok, f);
  await assertGucReset(db, 'after profile success');

  // Assigned, active, genuinely empty member: no child rows, claims or notes anywhere.
  const empty = await profileOk(f.children.emptyMemberId, agent);
  assertEmptyProfile(empty, f);
  assertNoForeignLeak(empty, f);
  await assertGucReset(db, 'after empty profile');

  const deniedMembers = [f.inactiveMemberId, f.unassignedMemberId];
  for (const memberId of deniedMembers) await forbid(memberId, agent, 'unadmitted member');
  await assertGucReset(db, 'after profile denied members');

  // The foreign-tenant member has no active admission for this agent in either tenant context.
  const foreignMember = f.children.foreignMemberId;
  await forbid(foreignMember, agent, 'foreign member');
  await forbid(foreignMember, { ...agent, tenantId: f.foreignTenantId }, 'foreign member access');
  await assertGucReset(db, 'after profile foreign member');

  const foreignAccess = effectiveTenant(f.agentId, f.tenantId, f.foreignTenantId);
  const deniedViewers: [Viewer, string][] = [
    [{ ...agent, id: `${f.agentId}-other` }, 'wrong agent'],
    [{ ...agent, tenantId: f.foreignTenantId }, 'foreign tenant'],
    [{ ...agent, tenantId: foreignAccess }, 'foreign access tenant'],
  ];
  for (const [viewer, label] of deniedViewers) await forbid(f.memberId, viewer, label);
  await assertGucReset(db, 'after profile denied viewers');

  for (const role of PROFILE_DENIED_ROLES) {
    await forbid(f.memberId, { ...agent, role: role as string | null | undefined }, 'role');
  }
  for (const tenantId of MISSING_TENANTS) {
    await forbid(f.memberId, { ...agent, tenantId }, 'missing tenant');
  }
  await assertGucReset(db, 'after profile role and tenant denials');

  const ownAccess = effectiveTenant(f.agentId, f.foreignTenantId, f.tenantId);
  const accessFirst = await profileOk(f.memberId, { ...agent, tenantId: ownAccess });
  assertMainProfile(accessFirst, f);
  assertNoForeignLeak(accessFirst, f);
  await assertGucReset(db, 'after profile access-first');

  return {
    profileClaimsTotal: ok.claimCounts.total,
    profileOpenClaims: ok.claimCounts.open,
    profileRecentClaims: ok.recentClaims.length,
    profileSubscriptions: ok.membership.subscription ? 1 : 0,
    profilePreferences: ok.preferences ? 1 : 0,
    profileActivities: ok.activities.length,
    profileEmptyProfiles: empty.membership.subscription === null ? 1 : 0,
    profileForeignChildControls: foreignChildIds(f).length,
    profileForeignDenied: 2,
    profileDeniedMembers: deniedMembers.length,
    profileDeniedViewers: deniedViewers.length,
    profileDeniedRoles: PROFILE_DENIED_ROLES.length,
    profileMissingTenants: MISSING_TENANTS.length,
    profileAccessFirst: 1,
  };
}

function readNotes(
  f: Fixture,
  memberId: string,
  role: unknown,
  id = f.agentId,
  home = f.tenantId,
  access = home
): Promise<NotesResult> {
  const session = cast<NotesSession>(sessionFor(id, role, home, access));
  return getMemberNotesCore({ session, memberId });
}

async function runNotes(f: Fixture, db: RlsDb): Promise<Counts> {
  const denied = async (result: Promise<NotesResult>, label: string) =>
    assert.deepEqual(await result, ACCESS_DENIED, label);

  assertRightfulNotes(await readNotes(f, f.memberId, AGENT), f);
  await assertGucReset(db, 'after notes success');
  const accessFirst = await readNotes(
    f,
    f.memberId,
    AGENT,
    f.agentId,
    f.foreignTenantId,
    f.tenantId
  );
  assertRightfulNotes(accessFirst, f);
  await assertGucReset(db, 'after notes access-first');

  const deniedMembers = [f.inactiveMemberId, f.unassignedMemberId];
  for (const memberId of deniedMembers) await denied(readNotes(f, memberId, AGENT), 'member');
  await assertGucReset(db, 'after notes denied members');

  const deniedViewers = [
    () => readNotes(f, f.memberId, AGENT, `${f.agentId}-other`),
    () => readNotes(f, f.memberId, AGENT, f.agentId, f.foreignTenantId),
    () => readNotes(f, f.memberId, AGENT, f.agentId, f.tenantId, f.foreignTenantId),
  ];
  for (const run of deniedViewers) await denied(run(), 'viewer');
  await assertGucReset(db, 'after notes denied viewers');

  for (const role of STAFF_FAMILY) {
    assertRightfulNotes(await readNotes(f, f.memberId, role), f);
    const inactive = await readNotes(f, f.inactiveMemberId, role);
    assert.ok(inactive.success && inactive.data?.length === 1, `${role}: tenant notes missing`);
  }
  await assertGucReset(db, 'after notes staff family');

  for (const role of NOTES_DENIED_ROLES) await denied(readNotes(f, f.memberId, role), 'role');
  await assertGucReset(db, 'after notes denied roles');

  return {
    notesRightful: f.rightfulNoteIds.length,
    notesSameTenantAuthors: new Set([f.agentId, f.children.staffAuthorId]).size,
    notesDeniedMembers: deniedMembers.length,
    notesDeniedViewers: deniedViewers.length,
    notesStaffFamily: STAFF_FAMILY.length,
    notesDeniedRoles: NOTES_DENIED_ROLES.length,
    notesAccessFirst: 1,
  };
}

/**
 * Runs the real agent client profile and member notes cores directly (no external tenant wrapper,
 * no privileged client) under the restricted NOBYPASSRLS connection.
 */
export async function runProfileNotesReader(f: Fixture, db: RlsDb): Promise<Counts> {
  assert.equal(await rawNoteCount(db), 0, 'notes RLS not engaged outside context');
  const profileCounts = await runProfile(f, db);
  const noteCounts = await runNotes(f, db);
  assert.equal(await rawNoteCount(db), 0, 'notes leaked outside context');
  await assertGucReset(db, 'after profile and notes');
  return { ...profileCounts, ...noteCounts };
}
