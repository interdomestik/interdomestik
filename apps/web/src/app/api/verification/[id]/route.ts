import { getVerificationRequestDetails } from '@/features/admin/verification/server/verification.core';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // RBAC check
  const allowedRoles = ['admin', 'super_admin', 'branch_manager', 'tenant_admin', 'staff'];
  if (!allowedRoles.includes(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Construct context
  const ctx = {
    tenantId: session.user.tenantId,
    userId: session.user.id,
    userRole: session.user.role as any,
    scope: { branchId: session.user.branchId || undefined },
    session,
  };

  const details = await getVerificationRequestDetails(ctx, id);

  if (!details) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json(details);
}
