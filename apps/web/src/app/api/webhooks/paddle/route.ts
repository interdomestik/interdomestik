import { db, subscriptions } from '@interdomestik/database';
import { EventName, Paddle } from '@paddle/paddle-node-sdk';
import { NextRequest, NextResponse } from 'next/server';

// We only initialize Paddle SDK if API Key is present, though for verifying webhooks
// strictly speaking we only need the secret key, but the SDK constructor requires API Key usually.
// If API key is missing, we can try-catch or assume environment is set.
const paddle = new Paddle(process.env.PADDLE_API_KEY || 'placeholder');

export async function POST(req: NextRequest) {
  const signature = req.headers.get('paddle-signature');
  const secret = process.env.PADDLE_WEBHOOK_SECRET_KEY;

  if (!signature || !secret) {
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 });
  }

  try {
    const body = await req.text();

    // Validate signature and parse event
    const eventData = await paddle.webhooks.unmarshal(body, secret, signature);

    if (!eventData) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    console.log(`Received Paddle Event: ${eventData.eventType}`);

    switch (eventData.eventType) {
      case EventName.SubscriptionCreated:
      case EventName.SubscriptionUpdated:
      case EventName.SubscriptionCanceled:
      case EventName.SubscriptionPastDue:
      case EventName.SubscriptionPaused:
      case EventName.SubscriptionResumed: {
        const sub = eventData.data;

        // Paddle user_id is usually custom_data or we match via email.
        // For now, we assume 'custom_data' contains { userId } passed during checkout.
        const customData = sub.customData as { userId?: string } | undefined;

        if (customData?.userId) {
          await db
            .insert(subscriptions)
            .values({
              id: sub.id,
              userId: customData.userId,
              status: sub.status,
              planId: sub.items[0]?.price?.id || 'unknown',
              currentPeriodEnd: sub.currentBillingPeriod?.endsAt
                ? new Date(sub.currentBillingPeriod.endsAt)
                : null,
              cancelAtPeriodEnd: sub.scheduledChange?.action === 'cancel',
            })
            .onConflictDoUpdate({
              target: subscriptions.id,
              set: {
                status: sub.status,
                planId: sub.items[0]?.price?.id || 'unknown',
                currentPeriodEnd: sub.currentBillingPeriod?.endsAt
                  ? new Date(sub.currentBillingPeriod.endsAt)
                  : null,
                cancelAtPeriodEnd: sub.scheduledChange?.action === 'cancel',
                updatedAt: new Date(),
              },
            });
        } else {
          console.warn('Subscription event missing userId in custom_data', sub.id);
        }
        break;
      }
      default:
        // Unhandled event
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Webhook processing failed:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
