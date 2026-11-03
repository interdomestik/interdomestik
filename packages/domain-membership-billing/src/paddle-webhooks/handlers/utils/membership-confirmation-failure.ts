import { type TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { PaddleWebhookDeps } from '../../types';

export async function recordDeliveryFailure(args: {
  store: NonNullable<PaddleWebhookDeps['membershipConfirmationDelivery']>;
  authority: TenantAuthority;
  deliveryId: string;
  error: string;
  idempotencyKey: string;
}) {
  try {
    await args.store.fail({
      authority: args.authority,
      deliveryId: args.deliveryId,
      error: args.error,
      idempotencyKey: args.idempotencyKey,
    });
  } catch (recordingError) {
    console.error(
      '[Webhook] Failed to record membership confirmation delivery failure:',
      recordingError
    );
  }
}
