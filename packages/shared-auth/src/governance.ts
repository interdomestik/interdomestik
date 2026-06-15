import { hasPermission, PERMISSIONS, ROLES } from './permissions';

export const BREAK_GLASS_AUDIT_EVENT = 'security.break_glass_used' as const;

export type GovernanceAction = 'fees.approve' | 'payments.approve' | 'terms.approve';

export interface GovernanceApprovalContext {
  actorRole: string | null | undefined;
  actorUserId: string;
  requestedByUserId: string;
}

export interface BreakGlassContext {
  reason: string | null | undefined;
  expiresAt: Date;
  now?: Date;
  reviewerUserId?: string | null;
}

export type BreakGlassValidation =
  | { success: true; auditEvent: typeof BREAK_GLASS_AUDIT_EVENT; metadata: BreakGlassAuditMetadata }
  | { success: false; error: 'reason_required' | 'expiry_required' | 'expiry_not_future' };

export interface BreakGlassAuditMetadata {
  reason: string;
  expiresAt: string;
  reviewerUserId?: string;
}

export function canApproveGovernanceAction({
  actorRole,
  actorUserId,
  requestedByUserId,
}: GovernanceApprovalContext): boolean {
  if (actorRole === ROLES.super_admin) return false;
  if (actorUserId === requestedByUserId) return false;
  return hasPermission(actorRole, PERMISSIONS['governance.approve']);
}

export function validateBreakGlassContext({
  reason,
  expiresAt,
  now = new Date(),
  reviewerUserId,
}: BreakGlassContext): BreakGlassValidation {
  const trimmedReason = reason?.trim();
  if (!trimmedReason) return { success: false, error: 'reason_required' };
  if (!(expiresAt instanceof Date) || Number.isNaN(expiresAt.getTime())) {
    return { success: false, error: 'expiry_required' };
  }
  if (expiresAt.getTime() <= now.getTime()) {
    return { success: false, error: 'expiry_not_future' };
  }

  return {
    success: true,
    auditEvent: BREAK_GLASS_AUDIT_EVENT,
    metadata: {
      reason: trimmedReason,
      expiresAt: expiresAt.toISOString(),
      ...(reviewerUserId ? { reviewerUserId } : {}),
    },
  };
}
