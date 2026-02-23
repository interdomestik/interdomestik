import * as Sentry from '@sentry/nextjs';
import { NextRequest, NextResponse } from 'next/server';

import { enforceRateLimit } from '@/lib/rate-limit';
import {
  getPaddleAndConfigForEntity,
  resolveBillingEntityFromPathSegment,
} from '@interdomestik/domain-membership-billing/paddle-server';

import { handlePaddleWebhookEntityCore } from './_core';

type WebhookRouteContext = {
  params: Promise<{ entity: string }>;
};

export async function POST(req: NextRequest, { params }: WebhookRouteContext) {
  const limited = await enforceRateLimit({
    name: 'api/webhooks/paddle',
    limit: 60,
    windowSeconds: 60,
    headers: req.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  const { entity: entityPathSegment } = await params;
  const entity = resolveBillingEntityFromPathSegment(entityPathSegment);

  if (!entity) {
    return NextResponse.json({ error: 'Unknown billing entity' }, { status: 404 });
  }

  try {
    const { paddle, config } = getPaddleAndConfigForEntity(entity, {
      allowLegacyFallback: false,
    });
    const secret = config.webhookSecret;
    const signature = req.headers.get('paddle-signature');
    const bodyText = await req.text();

    const result = await handlePaddleWebhookEntityCore({
      expectedEntity: entity,
      paddle,
      headers: req.headers,
      signature,
      secret,
      bodyText,
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        feature: 'webhooks',
        layer: 'paddle',
        action: 'handlePaddleWebhookEntity',
        entity,
      },
    });

    console.error('[Webhook Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
