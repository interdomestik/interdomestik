import { runNotificationDeliverySchedule } from '@/lib/notification-delivery-schedule';
import { enforceRateLimit } from '@/lib/rate-limit';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeCronRequest } from '../_auth';

export async function GET(req: NextRequest) {
  const limited = await enforceRateLimit({
    name: 'api/cron/notifications',
    limit: 10,
    windowSeconds: 60,
    headers: req.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  const ingress = authorizeCronRequest({ authorizationHeader: req.headers.get('authorization') });
  if (!ingress) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const summary = await runNotificationDeliverySchedule(ingress);
    const success = summary.tenantFailures === 0;
    return NextResponse.json({ success, ...summary }, { status: success ? 200 : 500 });
  } catch (cause) {
    const code = cause instanceof Error ? cause.name : 'UnknownError';
    console.error(
      '[Notification cron] Run failed',
      new Error('Notification cron failed', { cause: code })
    );
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
