import { auth } from '@/lib/auth';
import { isStaffOrHigher } from '@interdomestik/shared-auth';
import { NextResponse } from 'next/server';
import { submitAiReview } from './_core';

type ReviewAction = 'approve' | 'reject' | 'correct';

function isPrivilegedRole(role: string | null | undefined) {
  return role === 'admin' || isStaffOrHigher(role);
}

function isReviewAction(value: unknown): value is ReviewAction {
  return value === 'approve' || value === 'reject' || value === 'correct';
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isPrivilegedRole(session.user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: unknown;
    correctedExtraction?: Record<string, unknown>;
  } | null;

  if (!body || !isReviewAction(body.action)) {
    return NextResponse.json({ error: 'Invalid review action' }, { status: 400 });
  }

  const { id } = await params;
  const result = await submitAiReview({
    runId: id,
    tenantId: session.user.tenantId,
    reviewerId: session.user.id,
    reviewerRole: session.user.role,
    action: body.action,
    correctedExtraction: body.correctedExtraction,
  });

  if (result.kind === 'notFound') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  if (result.kind === 'unprocessable') {
    return NextResponse.json({ error: result.message }, { status: 422 });
  }

  return NextResponse.json(result.data);
}
