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

        const priceId = sub.items?.[0]?.price?.id || sub.items?.[0]?.priceId || 'unknown';
        const mappedStatus = mapPaddleStatus(sub.status);

        // Build base update values
        const baseValues = {
          status: mappedStatus,
          planId: priceId,
          providerCustomerId: sub.customerId || sub.customer_id,
          currentPeriodStart:
            sub.currentBillingPeriod?.startsAt || sub.current_billing_period?.starts_at
              ? new Date(
                  sub.currentBillingPeriod?.startsAt || sub.current_billing_period?.starts_at
                )
              : null,
          currentPeriodEnd:
            sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at
              ? new Date(sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at)
              : null,
          cancelAtPeriodEnd:
            sub.scheduledChange?.action === 'cancel' || sub.scheduled_change?.action === 'cancel',
          canceledAt: mappedStatus === 'canceled' ? new Date() : null,
          updatedAt: new Date(),
        };

        // If subscription is now active (recovered from past_due), clear dunning fields
        if (mappedStatus === 'active') {
          Object.assign(baseValues, {
            pastDueAt: null,
            gracePeriodEndsAt: null,
            dunningAttemptCount: 0,
            lastDunningAt: null,
          });
          console.log(`[Webhook] Subscription ${sub.id} recovered - clearing dunning fields`);
        }

        await db
          .insert(subscriptions)
          .values({
            id: sub.id,
            userId,
            ...baseValues,
          })
          .onConflictDoUpdate({
            target: subscriptions.id,
            set: baseValues,
          });

        console.log(
          `[Webhook] Updated subscription ${sub.id} (status: ${mappedStatus}) for user ${userId}`
        );
        break;
      }

      // DUNNING: Handle past_due subscription (payment failed)
      case EventName.SubscriptionPastDue: {
        const sub = data as any;
        const customData = (sub.customData || sub.custom_data) as { userId?: string } | undefined;
        const userId = customData?.userId;

        if (!userId) {
          console.warn(
            `[Webhook] No userId found in customData for past_due subscription ${sub.id}`
          );
          break;
        }

        const priceId = sub.items?.[0]?.price?.id || sub.items?.[0]?.priceId || 'unknown';
        const now = new Date();

        // Calculate grace period: 14 days from now
        const gracePeriodDays = 14;
        const gracePeriodEnd = new Date(now);
        gracePeriodEnd.setDate(gracePeriodEnd.getDate() + gracePeriodDays);

        // Get current dunning count to increment
        const existingSub = await db.query.subscriptions.findFirst({
          where: (subs, { eq }) => eq(subs.id, sub.id),
        });

        const newDunningCount = (existingSub?.dunningAttemptCount || 0) + 1;

        await db
          .insert(subscriptions)
          .values({
            id: sub.id,
            userId,
            status: 'past_due',
            planId: priceId,
            providerCustomerId: sub.customerId || sub.customer_id,
            pastDueAt: existingSub?.pastDueAt || now, // Keep original if already set
            gracePeriodEndsAt: existingSub?.gracePeriodEndsAt || gracePeriodEnd, // Keep original
            dunningAttemptCount: newDunningCount,
            lastDunningAt: now,
            currentPeriodStart:
              sub.currentBillingPeriod?.startsAt || sub.current_billing_period?.starts_at
                ? new Date(
                    sub.currentBillingPeriod?.startsAt || sub.current_billing_period?.starts_at
                  )
                : null,
            currentPeriodEnd:
              sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at
                ? new Date(sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at)
                : null,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: subscriptions.id,
            set: {
              status: 'past_due',
              planId: priceId,
              pastDueAt: existingSub?.pastDueAt || now,
              gracePeriodEndsAt: existingSub?.gracePeriodEndsAt || gracePeriodEnd,
              dunningAttemptCount: newDunningCount,
              lastDunningAt: now,
              updatedAt: now,
            },
          });

        console.log(
          `[Webhook] 🚨 DUNNING: Subscription ${sub.id} is past_due (attempt ${newDunningCount})`
        );
        console.log(`[Webhook] Grace period ends: ${gracePeriodEnd.toISOString()}`);

        // TODO: Send dunning notification email
        // await sendDunningEmail(userId, newDunningCount, gracePeriodEnd);

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
