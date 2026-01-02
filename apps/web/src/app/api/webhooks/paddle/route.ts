import { enforceRateLimit } from '@/lib/rate-limit';
import { getPaddle } from '@interdomestik/domain-membership-billing/paddle-server';
import { NextRequest, NextResponse } from 'next/server';

import { handlePaddleWebhookCore } from './_core';

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit({
    name: 'api/webhooks/paddle',
    limit: 60,
    windowSeconds: 60,
    headers: req.headers,
  });
  if (limited) return limited;

  try {
    const paddle = getPaddle();
    const signature = req.headers.get('paddle-signature');
    const secret = process.env.PADDLE_WEBHOOK_SECRET_KEY;
    const bodyText = await req.text();

    const result = await handlePaddleWebhookCore({
      paddle,
      headers: req.headers,
      signature,
      secret,
      bodyText,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('[Webhook Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
