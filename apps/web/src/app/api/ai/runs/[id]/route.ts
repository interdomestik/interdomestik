import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getAiRun } from '@interdomestik/domain-ai';
import { isStaffOrHigher } from '@interdomestik/shared-auth';
import { NextResponse } from 'next/server';

function isPrivilegedRole(role: string | null | undefined) {
  return role === 'admin' || isStaffOrHigher(role);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limited = await enforceRateLimit({
    name: 'api/ai/runs:get',
    limit: 60,
    windowSeconds: 60,
    headers: request.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const run = await getAiRun({
    tenantId: session.user.tenantId,
    runId: id,
  });

  if (!run) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (!isPrivilegedRole(session.user.role) && run.requestedBy !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.json({
    id: run.id,
    workflow: run.workflow,
    status: run.status,
    workflowState: run.workflowState,
    reviewStatus: run.reviewStatus,
    warnings: run.warnings,
    extraction: run.extraction,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    errorCode: run.errorCode,
    errorMessage: run.errorMessage,
  });
}
