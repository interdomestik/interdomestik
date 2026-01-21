import { getVerificationRequestDetails } from '@/features/admin/verification/server/verification.core';
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import { getVerificationApiCore } from './_core';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await getVerificationApiCore(
    {
      id,
      user: {
        id: session.user.id,
        role: session.user.role,
        tenantId: session.user.tenantId,
        branchId: session.user.branchId,
      },
    },
    {
      getVerificationDetailsFn: getVerificationRequestDetails,
    }
  );

  switch (result.kind) {
    case 'ok':
      return NextResponse.json(result.data);
    case 'forbidden':
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    case 'notFound':
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    default:
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
