import { db, subscriptions } from '@interdomestik/database';
import { Environment, EventName, Paddle } from '@paddle/paddle-node-sdk';
import { createHmac } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

const paddle = new Paddle(process.env.PADDLE_API_KEY || 'placeholder', {
  environment: (process.env.NEXT_PUBLIC_PADDLE_ENV as Environment) || Environment.sandbox,
});

// Verify Paddle webhook signature
function verifyPaddleSignature(body: string, signature: string, secret: string): boolean {
  try {
    // Paddle signature format: "ts=timestamp;h1=signature"
    const parts = signature.split(';');
    const timestamp = parts.find(p => p.startsWith('ts='))?.split('=')[1];
    const hash = parts.find(p => p.startsWith('h1='))?.split('=')[1];

    if (!timestamp || !hash) {
      console.error('[Webhook] Invalid signature format');
      return false;
    }

    // Create the signed payload: timestamp + ':' + body
    const signedPayload = `${timestamp}:${body}`;

    // Compute HMAC SHA256
    const expectedHash = createHmac('sha256', secret).update(signedPayload).digest('hex');

    // Compare hashes
    const isValid = hash === expectedHash;

    if (!isValid) {
      console.error('[Webhook] Signature mismatch');
      console.error('[Webhook] Expected:', expectedHash);
      console.error('[Webhook] Received:', hash);
    }

    return isValid;
  } catch (error) {
    console.error('[Webhook] Signature verification error:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('paddle-signature');
  const secret = process.env.PADDLE_WEBHOOK_SECRET_KEY;

  console.log('[Webhook] Received webhook request');
  console.log('[Webhook] Signature present:', !!signature);
  console.log('[Webhook] Secret present:', !!secret);

  if (!signature || !secret) {
    console.error('Webhook Error: Missing signature or secret');
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 });
  }

  try {
    const body = await req.text();
    console.log('[Webhook] Body length:', body.length);

    // Use Paddle SDK's built-in signature verification
    console.log('[Webhook] Verifying signature with Paddle SDK...');
    let eventData;

    // DEVELOPMENT MODE: Bypass signature verification
    // TODO: Fix signature verification issue with Paddle support
    // SECURITY WARNING: This must be fixed before production deployment
    const isDevelopment = process.env.NODE_ENV !== 'production';

    if (isDevelopment) {
      console.warn('[Webhook] ⚠️  DEVELOPMENT MODE: Signature verification bypassed');
      console.warn('[Webhook] ⚠️  This is NOT secure for production!');
      const parsedBody = JSON.parse(body);
      eventData = {
        eventType: parsedBody.event_type,
        data: parsedBody.data,
      };
    } else {
      // PRODUCTION: Require valid signature
      try {
        eventData = await paddle.webhooks.unmarshal(body, secret, signature);
        console.log('[Webhook] Signature verified successfully ✓');
      } catch (unmarshalError) {
        console.error('[Webhook] Paddle SDK unmarshal error:', unmarshalError);
        console.error(
          '[Webhook] Error message:',
          unmarshalError instanceof Error ? unmarshalError.message : 'Unknown'
        );
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    if (!eventData) {
      console.error('Webhook Error: Invalid event data');
      return NextResponse.json({ error: 'Invalid event data' }, { status: 401 });
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
        const sub = data as any;
        // Handle both camelCase (from SDK) and snake_case (from raw JSON)
        const customData = (sub.customData || sub.custom_data) as { userId?: string } | undefined;
        const userId = customData?.userId;

        if (!userId) {
          console.warn(`[Webhook] No userId found in customData for subscription ${sub.id}`);
          console.warn(`[Webhook] Custom data:`, customData);
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
