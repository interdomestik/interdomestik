import { ROLES } from '@interdomestik/shared-auth';

/**
 * ACQ-3b §3.4: who does what. Server-side and fail closed: an unknown role or a missing branch
 * never grants anything. Auditors and global support read nothing here and write nothing.
 */
export type SponsorActor = {
  userId: string;
  role: string;
  branchId: string | null;
  /** Agent tier; only an `office` agent works with company leads. */
  agentTier: string | null;
};

export type SponsorScope = {
  /** The agent who owns the source company lead; null when that lead is missing. */
  ownerAgentId: string | null;
  branchId: string;
};

const STAFF_ROLES: ReadonlySet<string> = new Set([
  ROLES.staff,
  ROLES.tenant_admin,
  ROLES.admin,
  ROLES.super_admin,
]);

export const isSponsorStaff = (actor: SponsorActor): boolean => STAFF_ROLES.has(actor.role);

const isOfficeAgentOwner = (actor: SponsorActor, scope: SponsorScope): boolean =>
  actor.role === 'agent' && actor.agentTier === 'office' && scope.ownerAgentId === actor.userId;

const isOwnBranchManager = (actor: SponsorActor, scope: SponsorScope): boolean =>
  actor.role === 'branch_manager' && actor.branchId !== null && actor.branchId === scope.branchId;

/** Create a sponsor, term or revision: office agent (own lead), branch manager (own branch), staff. */
export function canManageSponsor(actor: SponsorActor, scope: SponsorScope): boolean {
  return (
    isSponsorStaff(actor) || isOwnBranchManager(actor, scope) || isOfficeAgentOwner(actor, scope)
  );
}

/** Upload a list or mark "left the company": the same holders, on an effective term only. */
export function canManageRoster(
  actor: SponsorActor,
  scope: SponsorScope,
  termEffective: boolean
): boolean {
  return termEffective && canManageSponsor(actor, scope);
}

/** See the list and its company-visible statuses. */
export const canSeeRoster = canManageSponsor;

/** Approve or reject a revision, or terminate a term: staff only, never the revision's creator. */
export function canDecideRevision(actor: SponsorActor, creatorId: string): boolean {
  return isSponsorStaff(actor) && actor.userId !== creatorId;
}

/** Record handover evidence or close a handover. */
export const canManageHandover = isSponsorStaff;
