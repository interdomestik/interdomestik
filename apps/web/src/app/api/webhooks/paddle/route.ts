import { db, subscriptions } from '@interdomestik/database';
import { Environment, EventName, Paddle } from '@paddle/paddle-node-sdk';
import { NextRequest, NextResponse } from 'next/server';

const paddle = new Paddle(process.env.PADDLE_API_KEY || 'placeholder', {
  environment: (process.env.NEXT_PUBLIC_PADDLE_ENV as Environment) || Environment.sandbox,
});

export async function POST(req: NextRequest) {
  const signature = req.headers.get('paddle-signature');
  const secret = process.env.PADDLE_WEBHOOK_SECRET_KEY;

  if (!signature || !secret) {
    console.error('Webhook Error: Missing signature or secret');
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 });
  }

  try {
    const body = await req.text();

    // Validate signature and parse event
    const eventData = await paddle.webhooks.unmarshal(body, secret, signature);

    if (!eventData) {
      console.error('Webhook Error: Invalid signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    const { eventType, data } = eventData;
    console.log(`[Webhook] Processing ${eventType}`);

    const mapPaddleStatus = (
      status: string
    ): 'active' | 'past_due' | 'paused' | 'canceled' | 'trialing' | 'expired' => {
      switch (status) {
        case 'active':
          return 'active';
        case 'past_due':
          return 'past_due';
        case 'paused':
          return 'paused';
        case 'canceled':
        case 'deleted':
          return 'canceled';
        case 'trialing':
          return 'trialing';
        default:
          return 'expired';
      }
    };

    switch (eventType) {
      case EventName.SubscriptionCreated:
      case EventName.SubscriptionUpdated:
      case EventName.SubscriptionCanceled:
      case EventName.SubscriptionPastDue:
      case EventName.SubscriptionPaused:
      case EventName.SubscriptionResumed: {
        const sub = data;
        const customData = sub.customData as { userId?: string } | undefined;
        const userId = customData?.userId;

        if (!userId) {
          console.warn(`[Webhook] No userId found in customData for subscription ${sub.id}`);
          break;
        }

        const priceId = sub.items[0]?.price?.id || 'unknown';
        const mappedStatus = mapPaddleStatus(sub.status);

        await db
          .insert(subscriptions)
          .values({
            id: sub.id,
            userId,
            status: mappedStatus,
            planId: priceId,
            providerCustomerId: sub.customerId,
            currentPeriodStart: sub.currentBillingPeriod?.startsAt
              ? new Date(sub.currentBillingPeriod.startsAt)
              : null,
            currentPeriodEnd: sub.currentBillingPeriod?.endsAt
              ? new Date(sub.currentBillingPeriod.endsAt)
              : null,
            cancelAtPeriodEnd: sub.scheduledChange?.action === 'cancel',
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: subscriptions.id,
            set: {
              status: mappedStatus,
              planId: priceId,
              currentPeriodStart: sub.currentBillingPeriod?.startsAt
                ? new Date(sub.currentBillingPeriod.startsAt)
                : null,
              currentPeriodEnd: sub.currentBillingPeriod?.endsAt
                ? new Date(sub.currentBillingPeriod.endsAt)
                : null,
              cancelAtPeriodEnd: sub.scheduledChange?.action === 'cancel',
              updatedAt: new Date(),
            },
          });

        console.log(
          `[Webhook] Updated subscription ${sub.id} (status: ${mappedStatus}) for user ${userId}`
        );
        break;
      }

      case EventName.TransactionCompleted: {
        const tx = data;
        const customData = tx.customData as { userId?: string } | undefined;
        const userId = customData?.userId;

        if (userId && tx.subscriptionId) {
          // Sometimes transaction happens before subscription event is fully processed
          // We can pre-emptively create/touch the subscription record here
          console.log(
            `[Webhook] Transaction completed for sub ${tx.subscriptionId}, user ${userId}`
          );
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${eventType}`);
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Webhook Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
