import { RetryablePaddleWebhookError } from '../../errors';
import type { PaddleWebhookDeps } from '../../types';
import {
  assertMembershipConfirmationClaimSettled,
  toMembershipConfirmationJob,
  type MembershipConfirmationJob,
} from './membership-confirmation-job';
import { normalizeConfirmationText } from './membership-confirmation-values';

type RetryPreparation =
  { kind: 'continue' | 'stop' } | { kind: 'job'; job: MembershipConfirmationJob };

export async function prepareStoredMembershipConfirmationRetry(args: {
  tenantId?: string | null;
  providerEventId?: string;
  webhookPayloadHash?: string;
  providerReference: string;
  deps: Pick<PaddleWebhookDeps, 'membershipConfirmationDelivery' | 'sendThankYouLetter'>;
}): Promise<RetryPreparation> {
  const tenantId = normalizeConfirmationText(args.tenantId);
  const providerEventId = normalizeConfirmationText(args.providerEventId);
  const webhookPayloadHash = normalizeConfirmationText(args.webhookPayloadHash);
  if (!tenantId || !providerEventId || !webhookPayloadHash) {
    return { kind: 'continue' };
  }
  const store = args.deps.membershipConfirmationDelivery;
  if (!store?.claimReadyRetry || !args.deps.sendThankYouLetter) {
    throw new RetryablePaddleWebhookError(
      `Membership confirmation retry dependencies are unavailable for subscription ${args.providerReference}`
    );
  }

  const idempotencyKey = `membership-confirmation:v1:${tenantId}:${args.providerReference}`;
  let claim;
  try {
    claim = await store.claimReadyRetry({
      evidence: {
        tenantId,
        providerReference: args.providerReference,
        providerEventId,
        webhookPayloadHash,
      },
      idempotencyKey,
    });
  } catch (error) {
    console.error('[Webhook] Failed to recover ready membership confirmation retry:', error);
    throw new RetryablePaddleWebhookError(
      `Membership confirmation retry recovery failed for subscription ${args.providerReference}`
    );
  }
  assertMembershipConfirmationClaimSettled(claim, args.providerReference);

  if (claim.kind === 'claimed') {
    return {
      kind: 'job',
      job: toMembershipConfirmationJob({
        claim,
        idempotencyKey,
        send: args.deps.sendThankYouLetter,
        store,
      }),
    };
  }
  if (claim.kind === 'not_found' || claim.kind === 'requires_context') {
    return { kind: 'continue' };
  }

  console.warn(
    `[Webhook] Membership confirmation retry not sent for subscription ${args.providerReference}; delivery claim is ${claim.kind}`
  );
  return { kind: 'stop' };
}
