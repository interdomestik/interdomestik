export function buildPaddleEventDispatchParams(args: {
  eventType: string | undefined;
  data: unknown;
  tenantId: string | null;
  processingScopeKey: string;
  providerEventId: string | null;
  providerEventOccurredAt: string | null;
  webhookPayloadHash: string;
}) {
  return {
    eventType: args.eventType,
    data: args.data,
    tenantId: args.tenantId,
    processingScopeKey: args.processingScopeKey,
    providerEventId: args.providerEventId ?? undefined,
    providerEventOccurredAt: args.providerEventOccurredAt,
    webhookPayloadHash: args.webhookPayloadHash,
  };
}
