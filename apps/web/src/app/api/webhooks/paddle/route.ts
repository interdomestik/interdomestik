import { createCommission } from '@/actions/commissions';
import { calculateCommission } from '@/actions/commissions.types';
import { logAuditEvent } from '@/lib/audit';
import { sendPaymentFailedEmail } from '@/lib/email';
import { enforceRateLimit } from '@/lib/rate-limit';
import { db, subscriptions, user, webhookEvents } from '@interdomestik/database';
import { Environment, EventName, Paddle } from '@paddle/paddle-node-sdk';
import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { NextRequest, NextResponse } from 'next/server';

const paddle = new Paddle(process.env.PADDLE_API_KEY || 'placeholder', {
  environment: (process.env.NEXT_PUBLIC_PADDLE_ENV as Environment) || Environment.sandbox,
});

function sha256Hex(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

function coerceDate(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit({
    name: 'api/webhooks/paddle',
    limit: 60,
    windowSeconds: 60,
    headers: req.headers,
  });
  if (limited) return limited;

  const signature = req.headers.get('paddle-signature');
  const secret = process.env.PADDLE_WEBHOOK_SECRET_KEY;

  if (!signature || !secret) {
    console.error('Webhook Error: Missing signature or secret');
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 });
  }

  try {
    const body = await req.text();

    const payloadHash = sha256Hex(body);
    let parsedPayload: Record<string, unknown> = {};
    try {
      parsedPayload = JSON.parse(body) as Record<string, unknown>;
    } catch {
      // Keep parsedPayload empty; signature verification will fail anyway.
    }

    const eventTypeFromPayload =
      (parsedPayload['event_type'] as string | undefined) ||
      (parsedPayload['eventType'] as string | undefined) ||
      undefined;
    const eventIdFromPayload =
      (parsedPayload['event_id'] as string | undefined) ||
      (parsedPayload['eventId'] as string | undefined) ||
      (parsedPayload['id'] as string | undefined) ||
      undefined;
    const eventTimestampFromPayload =
      coerceDate(parsedPayload['occurred_at']) ||
      coerceDate(parsedPayload['occurredAt']) ||
      coerceDate(parsedPayload['timestamp']);

    // Use Paddle SDK's built-in signature verification
    let eventData;
    let signatureValid = false;
    let signatureBypassed = false;

    // Signature verification bypass is opt-in for local development only.
    // Some tunneling setups can cause verification failures due to timing windows; enable explicitly when needed.
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const allowDevBypass = process.env.PADDLE_WEBHOOK_BYPASS_SIGNATURE_IN_DEV === 'true';

    if (isDevelopment && allowDevBypass) {
      console.warn('[Webhook] DEV MODE: Paddle signature verification bypass ENABLED');
      const parsedBody = parsedPayload;
      eventData = {
        eventType: (parsedBody['event_type'] as string | undefined) || 'unknown',
        eventId:
          (parsedBody['event_id'] as string | undefined) ||
          (parsedBody['eventId'] as string | undefined) ||
          (parsedBody['id'] as string | undefined),
        data: parsedBody['data'],
      };
      signatureBypassed = true;
    } else {
      // PRODUCTION: Require valid signature
      try {
        eventData = await paddle.webhooks.unmarshal(body, secret, signature);
        signatureValid = true;
      } catch (unmarshalError) {
        console.error('[Webhook] Paddle SDK unmarshal error:', unmarshalError);
        console.error(
          '[Webhook] Error message:',
          unmarshalError instanceof Error ? unmarshalError.message : 'Unknown'
        );

        // Best-effort: record invalid signature attempts for investigation.
        try {
          await db
            .insert(webhookEvents)
            .values({
              id: nanoid(),
              provider: 'paddle',
              dedupeKey: eventIdFromPayload
                ? `paddle:${eventIdFromPayload}`
                : `paddle:sha256:${payloadHash}`,
              eventType: eventTypeFromPayload ?? null,
              eventId: eventIdFromPayload ?? null,
              signatureValid: false,
              eventTimestamp: eventTimestampFromPayload,
              payloadHash,
              payload: parsedPayload,
            })
            .onConflictDoNothing({
              target: webhookEvents.dedupeKey,
            });

          await logAuditEvent({
            actorRole: 'system',
            action: 'webhook.invalid_signature',
            entityType: 'webhook_event',
            metadata: {
              provider: 'paddle',
              eventType: eventTypeFromPayload,
              eventId: eventIdFromPayload,
              payloadHash,
            },
            headers: req.headers,
          });
        } catch (persistError) {
          console.error('[Webhook] Failed to persist invalid signature attempt:', persistError);
        }

        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    }

    if (!eventData) {
      console.error('Webhook Error: Invalid event data');
      return NextResponse.json({ error: 'Invalid event data' }, { status: 401 });
    }

    const eventType = (eventData as { eventType?: string }).eventType || eventTypeFromPayload;
    const eventId =
      (eventData as { eventId?: string }).eventId ||
      (eventData as { event_id?: string }).event_id ||
      eventIdFromPayload;
    const data = (eventData as { data?: unknown }).data;

    const dedupeKey = eventId ? `paddle:${eventId}` : `paddle:sha256:${payloadHash}`;

    const inserted = await db
      .insert(webhookEvents)
      .values({
        id: nanoid(),
        provider: 'paddle',
        dedupeKey,
        eventType: eventType ?? null,
        eventId: eventId ?? null,
        signatureValid: signatureValid || signatureBypassed,
        eventTimestamp: eventTimestampFromPayload,
        payloadHash,
        payload: parsedPayload,
      })
      .onConflictDoNothing({
        target: webhookEvents.dedupeKey,
      })
      .returning({
        id: webhookEvents.id,
      });

    if (inserted.length === 0) {
      await logAuditEvent({
        actorRole: 'system',
        action: 'webhook.duplicate',
        entityType: 'webhook_event',
        metadata: {
          provider: 'paddle',
          dedupeKey,
          eventType,
          eventId,
          signatureBypassed,
        },
        headers: req.headers,
      });
      return NextResponse.json({ success: true, duplicate: true });
    }

    const webhookEventRowId = inserted[0]!.id;

    await logAuditEvent({
      actorRole: 'system',
      action: 'webhook.received',
      entityType: 'webhook_event',
      entityId: webhookEventRowId,
      metadata: {
        provider: 'paddle',
        eventType,
        eventId,
        signatureValid,
        signatureBypassed,
      },
      headers: req.headers,
    });

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

    try {
      switch (eventType) {
        case EventName.SubscriptionCreated:
        case EventName.SubscriptionUpdated:
        case EventName.SubscriptionCanceled:
        case EventName.SubscriptionPaused:
        case EventName.SubscriptionResumed: {
          const sub = data as unknown as {
            id: string;
            customData?: { userId?: string; agentId?: string };
            custom_data?: { userId?: string; agentId?: string };
            status: string;
            items?: Array<{
              price?: { id?: string; unitPrice?: { amount?: string; currencyCode?: string } };
              priceId?: string;
            }>;
            customerId?: string;
            customer_id?: string;
            currentBillingPeriod?: { startsAt?: string; endsAt?: string };
            current_billing_period?: { starts_at?: string; ends_at?: string };
            scheduledChange?: { action?: string };
            scheduled_change?: { action?: string };
          };
          // Handle both camelCase (from SDK) and snake_case (from raw JSON)
          const customData = (sub.customData || sub.custom_data) as
            | { userId?: string; agentId?: string }
            | undefined;
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
                    sub.currentBillingPeriod?.startsAt ||
                      sub.current_billing_period?.starts_at ||
                      ''
                  )
                : null,
            currentPeriodEnd:
              sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at
                ? new Date(
                    sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at || ''
                  )
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

          // Create commission for new subscriptions with agent referral
          if (eventType === EventName.SubscriptionCreated) {
            const agentId = customData?.agentId;
            const transactionTotal =
              parseFloat(sub.items?.[0]?.price?.unitPrice?.amount || '0') / 100;

            if (agentId && transactionTotal > 0) {
              // Fetch agent's custom commission rates
              const agentSettings = await db.query.agentSettings?.findFirst({
                where: (settings, { eq }) => eq(settings.agentId, agentId),
              });
              const customRates = agentSettings?.commissionRates as
                | Record<string, number>
                | undefined;

              const commissionAmount = calculateCommission(
                'new_membership',
                transactionTotal,
                customRates
              );
              await createCommission({
                agentId,
                memberId: userId,
                subscriptionId: sub.id,
                type: 'new_membership',
                amount: commissionAmount,
                currency: sub.items?.[0]?.price?.unitPrice?.currencyCode || 'EUR',
                metadata: {
                  planId: priceId,
                  transactionTotal,
                  source: 'paddle_webhook',
                  customRates: !!customRates,
                },
              });
              console.log(
                `[Webhook] 💰 Commission created: €${commissionAmount} for agent ${agentId}${customRates ? ' (custom rates)' : ''}`
              );
            }

            // Send Thank-you Letter to new member
            try {
              const userData = await db.query.user?.findFirst({
                where: (u, { eq }) => eq(u.id, userId),
              });
              if (userData) {
                const { sendThankYouLetter } = await import('@/actions/thank-you-letter');
                const planPrice = sub.items?.[0]?.price?.unitPrice?.amount
                  ? (parseFloat(sub.items[0].price.unitPrice.amount) / 100).toFixed(2)
                  : '20.00';
                const periodEnd = sub.currentBillingPeriod?.endsAt
                  ? new Date(sub.currentBillingPeriod.endsAt)
                  : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

                await sendThankYouLetter({
                  email: userData.email,
                  memberName: userData.name,
                  memberNumber: userData.memberNumber || `M-${userId.slice(0, 8).toUpperCase()}`,
                  planName: priceId || 'Standard',
                  planPrice: `€${planPrice}`,
                  planInterval: 'year',
                  memberSince: new Date(),
                  expiresAt: periodEnd,
                  locale: 'en',
                });
                console.log(`[Webhook] 📧 Thank-you Letter sent to ${userData.email}`);
              }
            } catch (emailError) {
              console.error('[Webhook] Failed to send Thank-you Letter:', emailError);
            }
          }
          break;
        }

        // DUNNING: Handle past_due subscription (payment failed)
        case EventName.SubscriptionPastDue: {
          const sub = data as unknown as {
            id: string;
            customData?: { userId?: string };
            custom_data?: { userId?: string };
            items?: Array<{ price?: { id?: string; description?: string }; priceId?: string }>;
            customerId?: string;
            customer_id?: string;
            currentBillingPeriod?: { startsAt?: string; endsAt?: string };
            current_billing_period?: { starts_at?: string; ends_at?: string };
          };
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
                      sub.currentBillingPeriod?.startsAt ||
                        sub.current_billing_period?.starts_at ||
                        ''
                    )
                  : null,
              currentPeriodEnd:
                sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at
                  ? new Date(
                      sub.currentBillingPeriod?.endsAt || sub.current_billing_period?.ends_at || ''
                    )
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

          // Send Day 0 dunning email (only on first attempt)
          if (newDunningCount === 1) {
            try {
              // Fetch user email
              const userRecord = await db.query.user.findFirst({
                where: eq(user.id, userId),
              });

              if (userRecord?.email) {
                const planName = sub.items?.[0]?.price?.description || 'Membership';
                await sendPaymentFailedEmail(userRecord.email, {
                  memberName: userRecord.name || 'Member',
                  planName,
                  gracePeriodDays,
                  gracePeriodEndDate: gracePeriodEnd.toLocaleDateString(),
                });
                console.log(`[Webhook] ✉️ Day 0 dunning email sent to ${userRecord.email}`);
              } else {
                console.warn(`[Webhook] No email found for user ${userId}`);
              }
            } catch (emailError) {
              console.error('[Webhook] Failed to send dunning email:', emailError);
              // Don't fail the webhook if email fails
            }
          }

          break;
        }

        case EventName.TransactionCompleted: {
          const tx = data as
            | {
                customData?: { userId?: string };
                custom_data?: { userId?: string };
                subscriptionId?: string | null;
                subscription_id?: string | null;
              }
            | undefined;
          const customData = (tx?.customData || tx?.custom_data) as { userId?: string } | undefined;
          const userId = customData?.userId;
          const subscriptionId = tx?.subscriptionId || tx?.subscription_id;

          if (userId && subscriptionId) {
            // Sometimes transaction happens before subscription event is fully processed
            // We can pre-emptively create/touch the subscription record here
            console.log(
              `[Webhook] Transaction completed for sub ${subscriptionId}, user ${userId}`
            );
          }
          break;
        }

        default:
          console.log(`[Webhook] Unhandled event type: ${eventType}`);
          break;
      }

      await db
        .update(webhookEvents)
        .set({
          processedAt: new Date(),
          processingResult: 'ok',
          error: null,
        })
        .where(eq(webhookEvents.id, webhookEventRowId));

      await logAuditEvent({
        actorRole: 'system',
        action: 'webhook.processed',
        entityType: 'webhook_event',
        entityId: webhookEventRowId,
        metadata: {
          provider: 'paddle',
          eventType,
          eventId,
          result: 'ok',
        },
        headers: req.headers,
      });
    } catch (processingError) {
      const message =
        processingError instanceof Error ? processingError.message : String(processingError);
      await db
        .update(webhookEvents)
        .set({
          processedAt: new Date(),
          processingResult: 'error',
          error: message.slice(0, 2000),
        })
        .where(eq(webhookEvents.id, webhookEventRowId));

      await logAuditEvent({
        actorRole: 'system',
        action: 'webhook.failed',
        entityType: 'webhook_event',
        entityId: webhookEventRowId,
        metadata: {
          provider: 'paddle',
          eventType,
          eventId,
          result: 'error',
          error: message,
        },
        headers: req.headers,
      });

      throw processingError;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Webhook Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
