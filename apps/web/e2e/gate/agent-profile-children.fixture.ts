import {
  agentClients,
  dbAdmin,
  memberActivities,
  memberNotes,
  subscriptions,
  user,
  userNotificationPreferences,
} from '@interdomestik/database';
import { inArray } from 'drizzle-orm';

export type PreferenceValues = Record<
  | 'emailClaimUpdates'
  | 'emailMarketing'
  | 'emailNewsletter'
  | 'pushClaimUpdates'
  | 'pushMessages'
  | 'inAppAll',
  boolean
>;

export interface ActivityPlan {
  id: string;
  type: string;
  subject: string;
  description: string;
  occurredAt: string;
}

/** Synthetic child-row plan; ISO strings only so it can be serialized to the restricted reader. */
export interface ProfileChildFixture {
  emptyMemberId: string;
  emptyAssignmentId: string;
  foreignMemberId: string;
  staffAuthorId: string;
  staffAuthorName: string;
  staffNoteId: string;
  subscription: {
    id: string;
    planId: string;
    createdAt: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    foreignId: string;
    foreignPlanId: string;
  };
  preferences: {
    id: string;
    foreignId: string;
    createdAt: string;
    updatedAt: string;
    values: PreferenceValues;
  };
  /** Rightful main-member activities in expected read order (occurredAt descending). */
  activities: ActivityPlan[];
  foreignActivity: { id: string; subject: string };
}

export interface ProfileChildContext {
  tenantId: string;
  foreignTenantId: string;
  agentId: string;
  mainMemberId: string;
  branchId: string;
}

const day = (d: number) => new Date(Date.UTC(2099, 1, d));
const iso = (d: number) => day(d).toISOString();
// Same instant as the main fixture's date(5): newer than the recent public note.
const STAFF_NOTE_AT = new Date(Date.UTC(2099, 0, 1, 0, 0, 5));

// Every flag flipped away from the column default so defaults cannot satisfy the assertion.
const RIGHTFUL_PREFERENCES: PreferenceValues = {
  emailClaimUpdates: false,
  emailMarketing: true,
  emailNewsletter: false,
  pushClaimUpdates: false,
  pushMessages: false,
  inAppAll: false,
};
const FOREIGN_PREFERENCES: PreferenceValues = {
  emailClaimUpdates: true,
  emailMarketing: true,
  emailNewsletter: true,
  pushClaimUpdates: true,
  pushMessages: true,
  inAppAll: true,
};

/** Pure and synchronous: every id is known before any insert, so cleanup is exact after partial setup. */
export function planProfileChildren(prefix: string): ProfileChildFixture {
  return {
    emptyMemberId: `${prefix}-empty`,
    emptyAssignmentId: `${prefix}-assignment-empty`,
    foreignMemberId: `${prefix}-foreign-member`,
    staffAuthorId: `${prefix}-staff`,
    staffAuthorName: `${prefix}-staff-author`,
    staffNoteId: `${prefix}-note-staff`,
    subscription: {
      id: `${prefix}-subscription`,
      planId: `${prefix}-plan`,
      createdAt: iso(1),
      currentPeriodStart: iso(2),
      currentPeriodEnd: iso(20),
      foreignId: `${prefix}-subscription-foreign`,
      foreignPlanId: `${prefix}-foreign-plan`,
    },
    preferences: {
      id: `${prefix}-preferences`,
      foreignId: `${prefix}-preferences-foreign`,
      createdAt: iso(9),
      updatedAt: iso(11),
      values: RIGHTFUL_PREFERENCES,
    },
    activities: [
      {
        id: `${prefix}-activity-new`,
        type: 'call',
        subject: `${prefix} newer call`,
        description: 'S8 newer activity description',
        occurredAt: iso(12),
      },
      {
        id: `${prefix}-activity-old`,
        type: 'meeting',
        subject: `${prefix} older meeting`,
        description: 'S8 older activity description',
        occurredAt: iso(10),
      },
    ],
    foreignActivity: {
      id: `${prefix}-activity-foreign`,
      subject: `${prefix} foreign tenant marker`,
    },
  };
}

function person(id: string, tenantId: string, role: string, name: string, branchId?: string) {
  return {
    id,
    tenantId,
    name,
    email: `${id}@example.com`,
    role,
    emailVerified: true,
    branchId: branchId ?? null,
    createdAt: day(1),
    updatedAt: day(1),
  };
}

/** Requires the main agent and main member to exist already. Uses dbAdmin for fixture setup only. */
export async function seedProfileChildren(
  ctx: ProfileChildContext,
  plan: ProfileChildFixture
): Promise<void> {
  const { tenantId, foreignTenantId, agentId, mainMemberId, branchId } = ctx;
  await dbAdmin
    .insert(user)
    .values([
      person(plan.emptyMemberId, tenantId, 'member', plan.emptyMemberId, branchId),
      person(plan.foreignMemberId, foreignTenantId, 'member', plan.foreignMemberId),
      person(plan.staffAuthorId, tenantId, 'staff', plan.staffAuthorName),
    ]);
  await dbAdmin.insert(agentClients).values({
    id: plan.emptyAssignmentId,
    tenantId,
    agentId,
    memberId: plan.emptyMemberId,
    status: 'active',
  });

  const s = plan.subscription;
  await dbAdmin.insert(subscriptions).values([
    {
      id: s.id,
      tenantId,
      userId: mainMemberId,
      status: 'active',
      planId: s.planId,
      planKey: null,
      provider: 'paddle',
      currentPeriodStart: new Date(s.currentPeriodStart),
      currentPeriodEnd: new Date(s.currentPeriodEnd),
      createdAt: new Date(s.createdAt),
    },
    {
      id: s.foreignId,
      tenantId: foreignTenantId,
      userId: plan.foreignMemberId,
      status: 'active',
      planId: s.foreignPlanId,
      planKey: null,
      provider: 'paddle',
      currentPeriodStart: day(3),
      currentPeriodEnd: day(21),
      createdAt: day(14),
    },
  ]);

  const p = plan.preferences;
  await dbAdmin.insert(userNotificationPreferences).values([
    {
      id: p.id,
      tenantId,
      userId: mainMemberId,
      ...p.values,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt),
    },
    {
      id: p.foreignId,
      tenantId: foreignTenantId,
      userId: plan.foreignMemberId,
      ...FOREIGN_PREFERENCES,
      createdAt: day(13),
      updatedAt: day(14),
    },
  ]);

  const foreign = plan.foreignActivity;
  await dbAdmin.insert(memberActivities).values([
    ...plan.activities.map(a => ({
      id: a.id,
      tenantId,
      agentId,
      memberId: mainMemberId,
      type: a.type,
      subject: a.subject,
      description: a.description,
      occurredAt: new Date(a.occurredAt),
      createdAt: new Date(a.occurredAt),
      updatedAt: new Date(a.occurredAt),
    })),
    // Foreign-tenant row that references the own main member and is newer than every rightful row.
    {
      id: foreign.id,
      tenantId: foreignTenantId,
      agentId,
      memberId: mainMemberId,
      type: 'call',
      subject: foreign.subject,
      description: 'S8 foreign tenant activity description',
      occurredAt: day(15),
      createdAt: day(15),
      updatedAt: day(15),
    },
  ]);

  await dbAdmin.insert(memberNotes).values({
    id: plan.staffNoteId,
    tenantId,
    memberId: mainMemberId,
    authorId: plan.staffAuthorId,
    content: 'S8 staff authored public note',
    isPinned: false,
    isInternal: false,
    createdAt: STAFF_NOTE_AT,
  });
}

/** Exact-id cleanup; safe when setup stopped part-way. Every step runs, the first error is rethrown. */
export async function cleanupProfileChildren(plan: ProfileChildFixture): Promise<void> {
  const activityIds = [...plan.activities.map(a => a.id), plan.foreignActivity.id];
  const userIds = [plan.emptyMemberId, plan.foreignMemberId, plan.staffAuthorId];
  const steps: Array<() => Promise<unknown>> = [
    // The staff note references the staff author without cascade, so it goes before the users.
    () => dbAdmin.delete(memberNotes).where(inArray(memberNotes.id, [plan.staffNoteId])),
    () => dbAdmin.delete(memberActivities).where(inArray(memberActivities.id, activityIds)),
    () =>
      dbAdmin
        .delete(userNotificationPreferences)
        .where(
          inArray(userNotificationPreferences.id, [plan.preferences.id, plan.preferences.foreignId])
        ),
    () =>
      dbAdmin
        .delete(subscriptions)
        .where(inArray(subscriptions.id, [plan.subscription.id, plan.subscription.foreignId])),
    () => dbAdmin.delete(agentClients).where(inArray(agentClients.id, [plan.emptyAssignmentId])),
    () => dbAdmin.delete(user).where(inArray(user.id, userIds)),
  ];
  let failure: unknown;
  let failed = false;
  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      if (!failed) failure = error;
      failed = true;
    }
  }
  if (failed) throw failure;
}
