function assertNonBlank(value: string, field: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`domain event relay requires ${field}`);
  return normalized;
}

export function domainEventDeliveryIdempotencyKey(eventId: string, consumerName: string): string {
  return `domain-event:${assertNonBlank(consumerName, 'consumer.name')}:${assertNonBlank(eventId, 'event.id')}`;
}
