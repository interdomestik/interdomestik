export type VerificationResult =
  | { kind: 'ok'; data: any }
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'notFound' };

export interface VerificationServices {
  getVerificationDetailsFn: (ctx: any, id: string) => Promise<any>;
}

/**
 * Pure core logic for the Verification API.
 * Handles RBAC checks and orchestrates verification details lookup.
 */
export async function getVerificationApiCore(
  params: {
    id: string;
    user: {
      id: string;
      role: string;
      tenantId: string;
      branchId?: string | null;
    };
  },
  services: VerificationServices
): Promise<VerificationResult> {
  const { id, user } = params;

  // 1. RBAC Check
  const allowedRoles = ['admin', 'super_admin', 'branch_manager', 'tenant_admin', 'staff'];
  if (!allowedRoles.includes(user.role)) {
    return { kind: 'forbidden' };
  }

  try {
    // 2. Construct context for the service
    const ctx = {
      tenantId: user.tenantId,
      userId: user.id,
      userRole: user.role,
      scope: {
        branchId: user.branchId || null,
        actorAgentId: null,
        attributedAgentId: null,
      },
      // Note: session and requestHeaders are removed here to maintain purity.
      // If getVerificationDetailsFn strictly needs them, they should be passed as plain data if possible,
      // but usually the core service should rely on the resolved context.
    };

    const details = await services.getVerificationDetailsFn(ctx, id);

    if (!details) {
      return { kind: 'notFound' };
    }

    return {
      kind: 'ok',
      data: details,
    };
  } catch (error) {
    console.error('[VerificationCore] Error:', error);
    return { kind: 'notFound' }; // Or internal error if preferred
  }
}
