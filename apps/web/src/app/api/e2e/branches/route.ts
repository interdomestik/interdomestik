import { notFound } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';
import { handleE2EBranchOperation } from './_core';

export const dynamic = 'force-dynamic';

/**
 * E2E-only route; do not enable in production.
 * This route is used by Playwright tests to set up and tear down data.
 */

export async function POST(req: NextRequest) {
  const env = process.env as Record<string, string | undefined>;
  const nodeEnv = env['NODE_ENV'];
  const e2eApiSecret = env['E2E_API_SECRET'];
  const isAutomated = !!env['INTERDOMESTIK_AUTOMATED'];
  const isPlaywright = !!env['PLAYWRIGHT'];

  // 🛡️ SECURITY: Environment guard
  if (
    nodeEnv !== 'test' &&
    nodeEnv !== 'development' &&
    !e2eApiSecret &&
    !isAutomated &&
    !isPlaywright
  ) {
    return notFound();
  }

  // 🛡️ SECURITY: Server-side enable check
  if (!e2eApiSecret) {
    return notFound();
  }

  // 🛡️ SECURITY: Request authorization
  const secret = req.headers.get('x-e2e-secret');
  if (secret !== e2eApiSecret) {
    return notFound();
  }

  const body = await req.json();

  try {
    const result = await handleE2EBranchOperation(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error('[E2E API] Error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    const status = message.includes('Missing') || message.includes('Unknown') ? 400 : 500;
    return new NextResponse(message, { status });
  }
}
