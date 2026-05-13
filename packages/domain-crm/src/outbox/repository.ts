import type { CreateCrmOutboxEventData, CrmOutboxEvent } from './types';

export type CrmOutboxAppendResult =
  | { status: 'enqueued'; outboxEvent: CrmOutboxEvent }
  | { status: 'duplicate'; outboxEvent: CrmOutboxEvent };

export type CrmOutboxClaimPendingParams = {
  limit: number;
  lockedBy: string;
  now: string;
  tenantId?: string;
};

export type CrmOutboxMarkFailedParams = {
  error: string;
  eventId: string;
  nextAvailableAt?: string | null;
  now: string;
};

export interface CrmOutboxPort {
  appendEvent(params: { event: CreateCrmOutboxEventData }): Promise<CrmOutboxAppendResult>;
  appendEvents(params: {
    events: readonly CreateCrmOutboxEventData[];
  }): Promise<readonly CrmOutboxAppendResult[]>;
  claimPendingEvents(params: CrmOutboxClaimPendingParams): Promise<readonly CrmOutboxEvent[]>;
  markEventFailed(params: CrmOutboxMarkFailedParams): Promise<CrmOutboxEvent | null>;
  markEventPublished(params: { eventId: string; now: string }): Promise<CrmOutboxEvent | null>;
}
