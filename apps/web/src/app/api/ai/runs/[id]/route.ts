import { withMemberAcceptance } from '@/lib/privacy/require-member-acceptance';
import { getAiRun } from '@interdomestik/domain-ai';
import { isStaffOrHigher } from '@interdomestik/shared-auth';
import { NextResponse } from 'next/server';

function isPrivilegedRole(role: string | null | undefined) {
  return role === 'admin' || isStaffOrHigher(role);
}

export const GET = withMemberAcceptance(
  async ({ session, authority }, _request, { params }: { params: Promise<{ id: string }> }) => {
    const { id } = await params;
    const run = await getAiRun({
      authority,
      runId: id,
    });

    if (!run || (!isPrivilegedRole(session.user.role) && run.requestedBy !== session.user.id)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
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
  },
  {
    rateLimit: { name: 'api/ai/runs:get', limit: 60, windowSeconds: 60, productionSensitive: true },
  }
);
