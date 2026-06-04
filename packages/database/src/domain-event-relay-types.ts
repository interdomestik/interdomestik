export type DomainEventRelayEvent = {
  id: string;
  tenantId: string;
  actorId: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  eventName: string;
  eventVersion: number;
  aggregateVersion: number;
  correlationId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
};

export type DomainEventRelayConsumer = {
  name: string;
  deliver(event: DomainEventRelayEvent, delivery: { idempotencyKey: string }): Promise<void>;
};

export type RelayMode = 'undelivered' | 'replay';

export type RelayDomainEventsParams = {
  consumer: DomainEventRelayConsumer;
  limit: number;
  mode?: RelayMode;
  replayFrom?: { createdAt: Date; eventId?: string };
  tenantId: string;
};

export type RelayDomainEventsResult = {
  consumerInvocations: number;
  deliveryRecordsAlreadyExisted: number;
  deliveryRecordsCreated: number;
  selected: number;
};
