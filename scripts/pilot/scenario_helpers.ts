import dotenv from 'dotenv';

import { inArray } from 'drizzle-orm';

dotenv.config({ path: '.env.local' });

type PilotRole = 'staff' | 'agent' | 'member';
type ScenarioMessageInput = {
  senderId: string;
  content: string;
  createdAt: Date;
  isInternal?: boolean;
};

type ScenarioStageInput = {
  fromStatus: string;
  toStatus: string;
  changedById: string;
  changedByRole: PilotRole;
  note: string;
  createdAt: Date;
  isPublic?: boolean;
};

type ScenarioClaimInsertInput = {
  title: string;
  category: string;
  origin: string;
  status: 'submitted' | 'verification';
  createdAt: Date;
  updatedAt?: Date;
  userId: string;
  agentId?: string | null;
  staffId?: string | null;
  companyName?: string;
  tenantId?: string;
  stage?: ScenarioStageInput;
  messages?: ScenarioMessageInput[];
};

type PilotUserRecord = {
  id: string;
  email: string | null;
  tenantId: string | null;
};

const PILOT_TENANT_ID = 'tenant_ks';
const PILOT_OPERATOR_EMAILS = {
  agent: 'agent.ks.a1@interdomestik.com',
  member: 'member.ks.a1@interdomestik.com',
  staff: 'staff.ks.extra@interdomestik.com',
} as const;

function fatal(message: string): never {
  throw new Error(message);
}

export function resolveTimeWindow(baseDate: string, hour: number, minute: number): Date {
  const base = new Date(`${baseDate}T00:00:00Z`);
  base.setUTCHours(hour, minute, 0, 0);
  return base;
}

export function selectPilotOperators(
  users: PilotUserRecord[],
  tenantId: string = PILOT_TENANT_ID
): {
  agentId: string;
  memberId: string;
  staffId: string;
} {
  const byEmail = (email: string) =>
    users.find(user => user.email === email && user.tenantId === tenantId);

  const agent = byEmail(PILOT_OPERATOR_EMAILS.agent);
  const member = byEmail(PILOT_OPERATOR_EMAILS.member);
  const staff = byEmail(PILOT_OPERATOR_EMAILS.staff);

  if (!agent || !member || !staff) {
    fatal(`Could not find all operation handles for tenant ${tenantId} (agent, member, staff)`);
  }

  return {
    agentId: agent.id,
    memberId: member.id,
    staffId: staff.id,
  };
}

export async function loadPilotScenarioContext() {
  const { db } = await import('@interdomestik/database');
  const { claims, claimStageHistory, claimMessages } =
    await import('@interdomestik/database/schema/claims');
  const { user } = await import('@interdomestik/database/schema/auth');

  const pilotUsers = await db.query.user.findMany({
    where: inArray(user.email, [
      PILOT_OPERATOR_EMAILS.agent,
      PILOT_OPERATOR_EMAILS.member,
      PILOT_OPERATOR_EMAILS.staff,
    ]),
  });

  return {
    db,
    claims,
    claimMessages,
    claimStageHistory,
    operatorIds: selectPilotOperators(pilotUsers),
  };
}

export async function insertScenarioClaim(
  context: Awaited<ReturnType<typeof loadPilotScenarioContext>>,
  input: ScenarioClaimInsertInput
): Promise<string> {
  const claimId = crypto.randomUUID();
  const tenantId = input.tenantId ?? PILOT_TENANT_ID;

  await context.db.insert(context.claims).values({
    id: claimId,
    tenantId,
    title: input.title,
    companyName: input.companyName ?? 'SIGAL UNIQA Group Austria',
    userId: input.userId,
    agentId: input.agentId ?? null,
    staffId: input.staffId ?? null,
    category: input.category,
    status: input.status,
    origin: input.origin as any,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt ?? input.createdAt,
  });

  if (input.stage) {
    await context.db.insert(context.claimStageHistory).values({
      id: crypto.randomUUID(),
      claimId,
      tenantId,
      fromStatus: input.stage.fromStatus,
      toStatus: input.stage.toStatus,
      changedById: input.stage.changedById,
      changedByRole: input.stage.changedByRole,
      note: input.stage.note,
      isPublic: input.stage.isPublic ?? true,
      createdAt: input.stage.createdAt,
    });
  }

  for (const message of input.messages ?? []) {
    await context.db.insert(context.claimMessages).values({
      id: crypto.randomUUID(),
      claimId,
      tenantId,
      senderId: message.senderId,
      content: message.content,
      isInternal: message.isInternal ?? false,
      createdAt: message.createdAt,
    });
  }

  return claimId;
}
