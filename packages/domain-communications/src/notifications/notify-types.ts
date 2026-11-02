import type { sendPushToUser } from '../push';
import type { AuditLogger } from '../types';

// Notification event types
export type NotificationEvent =
  | 'claim_submitted'
  | 'claim_assigned'
  | 'claim_status_changed'
  | 'claim_pack_generated'
  | 'claim_pack_upgraded'
  | 'document_requested'
  | 'triage_complete'
  | 'escalation_accepted'
  | 'escalation_declined'
  | 'new_message'
  | 'sla_warning'
  | 'sla_breached'
  | 'membership_renewal'
  | 'payment_verification_update'
  | 'support_handoff_public_response';

export type NotificationDeps = {
  sendPushToUser?: typeof sendPushToUser;
  logAuditEvent?: AuditLogger;
  tenantId: string;
};

// Every notification names the tenant that owns it; the recipient lookup and the in-app row both
// run inside that tenant's context.
export type NotificationChannelOptions = {
  tenantId: string;
};
