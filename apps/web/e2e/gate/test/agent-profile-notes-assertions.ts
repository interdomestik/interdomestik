import assert from 'node:assert/strict';

import type { getMemberNotesCore } from '../../../src/actions/member-notes/get.core';
import type { getAgentClientProfileCore } from '../../../src/app/[locale]/(agent)/agent/clients/[id]/_core';
import type { AgentMessageFixture as Fixture } from '../agent-message-visibility.fixture';

export type ProfileOk = Extract<
  Awaited<ReturnType<typeof getAgentClientProfileCore>>,
  { kind: 'ok' }
>;
export type NotesResult = Awaited<ReturnType<typeof getMemberNotesCore>>;

const PROFILE_KEYS = [
  'activities',
  'claimCounts',
  'kind',
  'member',
  'membership',
  'preferences',
  'recentClaims',
];
const NOTE_KEYS = [
  'authorId',
  'authorName',
  'content',
  'createdAt',
  'followUpDate',
  'id',
  'isInternal',
  'isPinned',
  'memberId',
  'type',
  'updatedAt',
];
const PREF_KEYS = [
  'emailClaimUpdates',
  'emailMarketing',
  'emailNewsletter',
  'pushClaimUpdates',
  'pushMessages',
  'inAppAll',
] as const;
const ACTIVE_BADGE = 'bg-emerald-100 text-emerald-700 border-emerald-200';

const keys = (value: object): string[] => Object.keys(value).sort();
const iso = (value: Date | null | undefined): string | null => value?.toISOString() ?? null;

/** Ids of the foreign-tenant child controls that must never be returned. */
export const foreignChildIds = (f: Fixture): string[] => [
  f.children.subscription.foreignId,
  f.children.preferences.foreignId,
  f.children.foreignActivity.id,
];

export function assertNoForeignLeak(value: unknown, f: Fixture): void {
  const text = JSON.stringify(value);
  const tokens = [
    ...foreignChildIds(f),
    f.children.foreignMemberId,
    f.children.foreignActivity.subject,
    f.children.subscription.foreignPlanId,
    f.foreignTenantId,
  ];
  for (const token of tokens) assert.ok(!text.includes(token), 'foreign marker leaked');
}

function assertClaims(result: ProfileOk, f: Fixture): void {
  assert.deepEqual(keys(result.claimCounts), ['open', 'rejected', 'resolved', 'total']);
  assert.deepEqual(result.claimCounts, { total: 105, open: 105, resolved: 0, rejected: 0 });
  assert.deepEqual(
    result.recentClaims.map(claim => claim.id),
    f.claimIds.slice(0, 6)
  );
  for (const claim of result.recentClaims) {
    assert.deepEqual(keys(claim), ['id', 'status']);
    assert.equal(claim.status, 'submitted');
  }
}

/** Main admitted member: exact rightful subscription, preferences, activities and agent projection. */
export function assertMainProfile(result: ProfileOk, f: Fixture): void {
  const c = f.children;
  assert.deepEqual(keys(result), PROFILE_KEYS);
  const { member } = result;
  assert.equal(member.id, f.memberId);
  assert.equal(member.tenantId, f.tenantId);
  assert.equal(member.agentId, f.agentId);
  assert.ok('agent' in member && !('password' in member));
  assert.deepEqual(member.agent, {
    id: f.agentId,
    name: f.agentName,
    email: f.email,
    image: null,
  });

  assert.deepEqual(keys(result.membership), ['badgeClass', 'status', 'subscription']);
  assert.equal(result.membership.status, 'active');
  assert.equal(result.membership.badgeClass, ACTIVE_BADGE);
  const sub = result.membership.subscription;
  assert.ok(sub, 'rightful subscription missing');
  assert.equal(sub.id, c.subscription.id);
  assert.equal(sub.tenantId, f.tenantId);
  assert.equal(sub.userId, f.memberId);
  assert.equal(sub.status, 'active');
  assert.equal(sub.planId, c.subscription.planId);
  assert.equal(sub.planKey, null);
  assert.equal(sub.provider, 'paddle');
  assert.equal(iso(sub.createdAt), c.subscription.createdAt);
  assert.equal(iso(sub.currentPeriodStart), c.subscription.currentPeriodStart);
  assert.equal(iso(sub.currentPeriodEnd), c.subscription.currentPeriodEnd);

  const prefs = result.preferences;
  assert.ok(prefs, 'rightful preferences missing');
  assert.equal(prefs.id, c.preferences.id);
  assert.equal(prefs.tenantId, f.tenantId);
  assert.equal(prefs.userId, f.memberId);
  for (const key of PREF_KEYS) assert.equal(prefs[key], c.preferences.values[key], key);
  assert.equal(iso(prefs.createdAt), c.preferences.createdAt);
  assert.equal(iso(prefs.updatedAt), c.preferences.updatedAt);

  const projected = result.activities.map(activity => {
    const row = activity as typeof activity & { agent: unknown };
    return {
      id: row.id,
      tenantId: row.tenantId,
      memberId: row.memberId,
      agentId: row.agentId,
      type: row.type,
      subject: row.subject,
      description: row.description,
      occurredAt: iso(row.occurredAt),
      agent: row.agent,
    };
  });
  const expected = c.activities.map(a => ({
    id: a.id,
    tenantId: f.tenantId,
    memberId: f.memberId,
    agentId: f.agentId,
    type: a.type,
    subject: a.subject,
    description: a.description,
    occurredAt: a.occurredAt,
    agent: { id: f.agentId, name: f.agentName, email: f.email },
  }));
  assert.equal(projected.length, 2);
  assert.deepEqual(projected, expected);
  assertClaims(result, f);
}

/** Genuinely empty assigned member: no membership, preferences, activities or claims. */
export function assertEmptyProfile(result: ProfileOk, f: Fixture): void {
  assert.deepEqual(keys(result), PROFILE_KEYS);
  assert.equal(result.member.id, f.children.emptyMemberId);
  assert.equal(result.member.tenantId, f.tenantId);
  assert.deepEqual(keys(result.membership), ['badgeClass', 'status', 'subscription']);
  assert.equal(result.membership.status, 'none');
  assert.equal(result.membership.subscription, null);
  assert.equal(result.preferences, null);
  assert.deepEqual(result.activities, []);
  assert.deepEqual(result.claimCounts, { total: 0, open: 0, resolved: 0, rejected: 0 });
  assert.deepEqual(result.recentClaims, []);
}

/** Rightful notes in read order: pinned internal, newer staff-authored public, older agent public. */
export function assertRightfulNotes(result: NotesResult, f: Fixture): void {
  if (!result.success) assert.fail(`notes read failed: ${result.error}`);
  assert.ok(result.data, 'successful notes result must contain data');
  const notes = result.data;
  assert.equal(f.rightfulNoteIds.length, 3);
  const agent = { authorId: f.agentId, authorName: f.agentName };
  const staff = { authorId: f.children.staffAuthorId, authorName: f.children.staffAuthorName };
  const expected = [
    { id: f.rightfulNoteIds[0], ...agent, isInternal: true, isPinned: true },
    { id: f.rightfulNoteIds[1], ...staff, isInternal: false, isPinned: false },
    { id: f.rightfulNoteIds[2], ...agent, isInternal: false, isPinned: false },
  ].map(note => ({ ...note, memberId: f.memberId }));
  assert.deepEqual(
    notes.map(note => ({
      id: note.id,
      authorId: note.authorId,
      authorName: note.authorName,
      isInternal: note.isInternal,
      isPinned: note.isPinned,
      memberId: note.memberId,
    })),
    expected
  );
  for (const note of notes) assert.deepEqual(keys(note), NOTE_KEYS);
  const text = JSON.stringify(notes);
  assert.doesNotMatch(text, /foreign tenant note/);
  assert.ok(!text.includes(f.foreignNoteId), 'foreign note leaked');
}
