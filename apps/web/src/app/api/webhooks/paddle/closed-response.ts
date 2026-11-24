import { PaddleClosedError } from '@interdomestik/domain-membership-billing/paddle-closed';
import { NextResponse } from 'next/server';

export function closedPaddleWebhookResponse() {
  const { code, message } = new PaddleClosedError();
  return NextResponse.json(
    { code, error: message },
    { status: 503, headers: { 'Retry-After': '3600' } }
  );
}
