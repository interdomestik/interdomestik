import type { CreateCrmOutboxEventData } from '@interdomestik/domain-crm/outbox/types';
import type { CrmOutboxAppendResult } from '@interdomestik/domain-crm/outbox/repository';

import type { CrmTenantExecutor } from './tenant-runner';

/** No CRM outbox store persists on a tenant transaction yet. */
export class CrmRoutingOutboxUnavailableError extends Error {
  constructor() {
    super('CRM routing outbox has no transactional store');
    this.name = 'CrmRoutingOutboxUnavailableError';
  }
}

/** Appends a routed event on the routing transaction itself, so the event commits or rolls back
 * with the routing writes. Until a transactional CRM outbox store exists this fails closed: the
 * routing application rolls back and reports `repository_failure` instead of committing routing
 * writes without their event, or an event without its routing writes. */
export function appendRoutingOutboxEventInTransaction(
  _database: CrmTenantExecutor,
  _params: { event: CreateCrmOutboxEventData }
): Promise<CrmOutboxAppendResult> {
  return Promise.reject(new CrmRoutingOutboxUnavailableError());
}
