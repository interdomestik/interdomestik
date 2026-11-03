import type { IngressCapability } from '@interdomestik/database/ingress';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';

export function buildPaddleEventDispatchParams(args: {
  eventType: string | undefined;
  data: unknown;
  delivery: IngressCapability<'paddle-delivery'>;
  authority: TenantAuthority | null;
  processingScopeKey: string;
  providerEventId: string | null;
  providerEventOccurredAt: string | null;
  webhookPayloadHash: string;
}) {
  return {
    eventType: args.eventType,
    data: args.data,
    delivery: args.delivery,
    authority: args.authority,
    processingScopeKey: args.processingScopeKey,
    providerEventId: args.providerEventId ?? undefined,
    providerEventOccurredAt: args.providerEventOccurredAt,
    webhookPayloadHash: args.webhookPayloadHash,
  };
}
