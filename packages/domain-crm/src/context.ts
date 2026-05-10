export const CRM_ACTOR_ROLES = ['member', 'agent', 'staff', 'branch_manager', 'admin'] as const;
export type CrmActorRole = (typeof CRM_ACTOR_ROLES)[number];

export type CrmActorScope = {
  branchId?: string | null;
  agentId?: string | null;
  memberId?: string | null;
  staffId?: string | null;
  permissions?: readonly string[];
};

export type CrmActorContext = {
  tenantId: string;
  actorId: string;
  role: CrmActorRole;
  scope: CrmActorScope;
};

export function isStaffLikeCrmActor(context: CrmActorContext): boolean {
  return context.role === 'staff' || context.role === 'branch_manager' || context.role === 'admin';
}

export function isMemberCrmActor(context: CrmActorContext): boolean {
  return context.role === 'member';
}
