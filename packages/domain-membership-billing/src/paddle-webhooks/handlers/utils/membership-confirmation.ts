import { RetryablePaddleWebhookError } from '../../errors';
import type {
  CheckoutCustomData,
  MembershipConfirmationEvidence,
  MembershipConfirmationSnapshot,
  PaddleWebhookDeps,
} from '../../types';
import {
  normalizeConfirmationText,
  resolveProviderConfirmation,
} from './membership-confirmation-values';
import type { WebhookUserRecord } from './new-membership-ownership';
import {
  assertMembershipConfirmationClaimSettled,
  toMembershipConfirmationJob,
  type MembershipConfirmationJob,
} from './membership-confirmation-job';

export const redactEmail = (email?: string | null) => {
  if (!email) return 'unknown';
  const [local, domain] = email.split('@');
  if (!domain) return 'unknown';
  const maskedLocal = local.length <= 2 ? `${local[0] ?? ''}*` : `${local[0]}***${local.slice(-1)}`;
  return `${maskedLocal}@${domain}`;
};

type MembershipConfirmationPreparation =
  { kind: 'continue' | 'stop' } | { kind: 'job'; job: MembershipConfirmationJob };

type MembershipConfirmationArgs = {
  eventType: string;
  providerEventId?: string;
  webhookPayloadHash?: string;
  sub: any;
  tenantId: string;
  userId?: string;
  internalSubscriptionId?: string;
  customData: CheckoutCustomData | undefined;
  userRecord: WebhookUserRecord | null;
  deps: Pick<
    PaddleWebhookDeps,
    'membershipConfirmationDelivery' | 'prepareThankYouLetter' | 'sendThankYouLetter'
  >;
};

export async function prepareMembershipConfirmation(
  args: MembershipConfirmationArgs
): Promise<MembershipConfirmationPreparation> {
  const {
    eventType,
    providerEventId,
    webhookPayloadHash,
    sub,
    tenantId,
    userId,
    internalSubscriptionId,
    customData,
    userRecord,
    deps,
  } = args;
  if (eventType !== 'subscription.created') {
    console.warn(
      `[Webhook] Membership confirmation not sent for subscription ${sub.id}; provider event is not subscription.created`
    );
    return { kind: 'continue' };
  }
  if (
    !normalizeConfirmationText(userId) ||
    !normalizeConfirmationText(providerEventId) ||
    !normalizeConfirmationText(webhookPayloadHash)
  ) {
    console.warn(
      `[Webhook] Membership confirmation not sent for subscription ${sub.id}; immutable provider identity is incomplete`
    );
    return { kind: 'continue' };
  }
  if (!deps.sendThankYouLetter || !deps.membershipConfirmationDelivery) {
    throw new RetryablePaddleWebhookError(
      `Membership confirmation delivery dependencies are unavailable for subscription ${sub.id}`
    );
  }

  const idempotencyKey = `membership-confirmation:v1:${tenantId}:${sub.id}`;
  const evidence: MembershipConfirmationEvidence = {
    tenantId,
    userId: userId!,
    subscriptionId: internalSubscriptionId ?? sub.id,
    providerReference: sub.id,
    providerEventId: providerEventId!,
    webhookPayloadHash: webhookPayloadHash!,
  };
  let existingClaim;
  try {
    existingClaim = await deps.membershipConfirmationDelivery.claimExisting({
      evidence,
      idempotencyKey,
    });
  } catch (error) {
    console.error('[Webhook] Failed to recover membership confirmation claim:', error);
    throw new RetryablePaddleWebhookError(
      `Membership confirmation claim recovery failed for subscription ${sub.id}`
    );
  }
  assertMembershipConfirmationClaimSettled(existingClaim, sub.id);
  if (existingClaim.kind === 'claimed') {
    return {
      kind: 'job',
      job: toMembershipConfirmationJob({
        claim: existingClaim,
        idempotencyKey,
        send: deps.sendThankYouLetter,
        store: deps.membershipConfirmationDelivery,
      }),
    };
  }
  if (existingClaim.kind !== 'not_found') {
    console.warn(
      `[Webhook] Membership confirmation not sent for subscription ${sub.id}; delivery claim is ${existingClaim.kind}`
    );
    return { kind: 'stop' };
  }

  if (!userRecord) {
    console.warn(
      `[Webhook] Membership confirmation not sent for subscription ${sub.id}; authoritative member is unavailable`
    );
    return { kind: 'continue' };
  }

  const confirmation = resolveProviderConfirmation({ sub, customData, userRecord });
  if (!confirmation.ok) {
    console.warn(
      `[Webhook] Membership confirmation not sent for subscription ${sub.id}; ${confirmation.reason}`
    );
    return { kind: 'continue' };
  }
  if (!deps.prepareThankYouLetter) {
    throw new RetryablePaddleWebhookError(
      `Membership confirmation request preparation is unavailable for subscription ${sub.id}`
    );
  }

  let emailRequest;
  try {
    emailRequest = deps.prepareThankYouLetter({
      ...confirmation.value,
      tenantId,
      providerReference: sub.id,
    });
  } catch (error) {
    console.error('[Webhook] Failed to prepare membership confirmation request:', error);
    throw new RetryablePaddleWebhookError(
      `Membership confirmation request preparation failed for subscription ${sub.id}`
    );
  }
  const snapshot: MembershipConfirmationSnapshot = {
    ...confirmation.value,
    memberSince: confirmation.value.memberSince.toISOString(),
    expiresAt: confirmation.value.expiresAt.toISOString(),
    ...evidence,
    providerStatus: 'active',
    eventType: 'subscription.created',
    emailRequest,
  };
  let claim;
  try {
    claim = await deps.membershipConfirmationDelivery.claim({ idempotencyKey, snapshot });
  } catch (error) {
    console.error('[Webhook] Failed to persist membership confirmation claim:', error);
    throw new RetryablePaddleWebhookError(
      `Membership confirmation claim failed for subscription ${sub.id}`
    );
  }
  assertMembershipConfirmationClaimSettled(claim, sub.id);
  if (claim.kind !== 'claimed') {
    console.warn(
      `[Webhook] Membership confirmation not sent for subscription ${sub.id}; delivery claim is ${claim.kind}`
    );
    return { kind: 'stop' };
  }

  return {
    kind: 'job',
    job: toMembershipConfirmationJob({
      claim,
      idempotencyKey,
      send: deps.sendThankYouLetter,
      store: deps.membershipConfirmationDelivery,
    }),
  };
}

export async function readyMembershipConfirmation(
  job: MembershipConfirmationJob,
  subscriptionId: string
): Promise<void> {
  if (job.snapshot.subscriptionId !== subscriptionId) {
    throw new Error('Membership confirmation subscription identity changed before delivery');
  }
  try {
    await job.store.ready({
      deliveryId: job.deliveryId,
      idempotencyKey: job.idempotencyKey,
      subscriptionId,
      tenantId: job.snapshot.tenantId,
    });
  } catch (error) {
    console.error('[Webhook] Failed to mark membership confirmation ready:', error);
    throw new RetryablePaddleWebhookError(
      `Membership confirmation readiness failed for subscription ${job.snapshot.providerReference}`
    );
  }
}

export async function deliverMembershipConfirmation(job: MembershipConfirmationJob): Promise<void> {
  try {
    const delivery = await job.send({
      request: job.snapshot.emailRequest,
      tenantId: job.snapshot.tenantId,
      providerReference: job.snapshot.providerReference,
      idempotencyKey: job.idempotencyKey,
    });
    if (!delivery.success) {
      await recordDeliveryFailure({
        store: job.store,
        deliveryId: job.deliveryId,
        error: delivery.error,
        idempotencyKey: job.idempotencyKey,
        tenantId: job.snapshot.tenantId,
      });
      console.error(
        `[Webhook] Membership confirmation delivery failed for subscription ${job.snapshot.providerReference}: ${delivery.error}`
      );
      throw new RetryablePaddleWebhookError(
        `Membership confirmation delivery failed for subscription ${job.snapshot.providerReference}`
      );
    }
    await job.store.complete({
      deliveryId: job.deliveryId,
      idempotencyKey: job.idempotencyKey,
      providerMessageId: delivery.id,
      tenantId: job.snapshot.tenantId,
    });
    console.log(`[Webhook] 📧 Thank-you Letter sent to ${redactEmail(job.snapshot.email)}`);
  } catch (emailError) {
    if (emailError instanceof RetryablePaddleWebhookError) throw emailError;
    const message = emailError instanceof Error ? emailError.message : 'Unknown delivery failure';
    await recordDeliveryFailure({
      store: job.store,
      deliveryId: job.deliveryId,
      error: message,
      idempotencyKey: job.idempotencyKey,
      tenantId: job.snapshot.tenantId,
    });
    console.error('[Webhook] Failed to send Thank-you Letter:', emailError);
    throw new RetryablePaddleWebhookError(
      `Membership confirmation delivery failed for subscription ${job.snapshot.providerReference}`
    );
  }
}

export async function processMembershipConfirmation(
  args: MembershipConfirmationArgs
): Promise<void> {
  const preparation = await prepareMembershipConfirmation(args);
  if (preparation.kind !== 'job') return;
  const { job } = preparation;
  if (job.requiresEffects) {
    await readyMembershipConfirmation(job, job.snapshot.subscriptionId);
  }
  await deliverMembershipConfirmation(job);
}

async function recordDeliveryFailure(args: {
  store: NonNullable<PaddleWebhookDeps['membershipConfirmationDelivery']>;
  deliveryId: string;
  error: string;
  idempotencyKey: string;
  tenantId: string;
}) {
  try {
    await args.store.fail({
      deliveryId: args.deliveryId,
      error: args.error,
      idempotencyKey: args.idempotencyKey,
      tenantId: args.tenantId,
    });
  } catch (recordingError) {
    console.error(
      '[Webhook] Failed to record membership confirmation delivery failure:',
      recordingError
    );
  }
}
