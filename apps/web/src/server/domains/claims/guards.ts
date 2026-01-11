import { ensureTenantId } from '@interdomestik/shared-auth';

// Define a minimal session interface that matches what we expect from auth()
// Adapting to your project's `Session` type which seems to be from 'better-auth' or 'next-auth'
// checking usages... usually inferred.
// We'll trust the caller passes the session object.

export interface ClaimsAccessContext {
  tenantId: string;
  role: string;
  branchId: string | null;
  userId: string;
}

export function ensureClaimsAccess(session: any): ClaimsAccessContext {
  if (!session || !session.user) {
    throw new Error('Unauthorized');
  }

  const tenantId = ensureTenantId(session);
  const user = session.user;
  const role = user.role || 'member';
  const branchId = user.branchId || null;
  const userId = user.id;

  // Basic role check - members have their own portal, this is for admin execution mainly?
  // The Prompt: "Upgrade the old Claims admin list" -> Implies Admin/Staff context.
  // But we should be safe.
  // If role is member -> they shouldn't be calling this admin-scoped domain function usually?
  // But if they do, we scope to their ID?
  // Prompt says: "Claims must be branch-scoped where relevant... staff sees claims assigned..."

  // We return the context, the Query Builder will apply the strict filters.
  return {
    tenantId,
    role,
    branchId,
    userId,
  };
}
