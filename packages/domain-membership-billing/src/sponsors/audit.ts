import { auditLog, type TenantTransaction } from '@interdomestik/database';
import { nanoid } from 'nanoid';

/**
 * ACQ-3b §3.9 audit events (`audit_log`, read by staff/admin only, kept 5 years). Payloads carry
 * identifiers, counts, reasons and states only: never an address, a name, a token or mail content.
 * The metadata keys are closed so a caller cannot add personal data by accident.
 */
export type SponsorAuditAction =
  | 'sponsor.created'
  | 'sponsor_term.created'
  | 'sponsor_revision.created'
  | 'sponsor_revision.decided'
  | 'sponsor_term.terminated'
  | 'sponsor_roster.list_uploaded'
  | 'sponsor_roster.bound_at_upload'
  | 'sponsor_roster.left_company'
  | 'sponsor_entry.started'
  | 'sponsor_entry.revoked'
  | 'sponsor_entry.opted_out'
  | 'sponsor_intent.state'
  | 'sponsor_mail.failed';

export type SponsorAuditEntity =
  | 'sponsor'
  | 'sponsor_term'
  | 'sponsor_revision'
  | 'sponsor_roster_entry'
  | 'sponsor_handover_intent'
  | 'sponsor_mail';

export type SponsorAuditMetadata = Partial<{
  sponsorId: string;
  termId: string;
  revisionId: string;
  entryId: string;
  intentId: string;
  count: number;
  decision: 'approved' | 'rejected';
  reason: string;
  state: string;
  previousState: string;
  evidenceId: string;
  disposition: 'canceled' | 'renewing_as_member';
  kind: string;
  code: string;
  at: string;
}>;

export type SponsorAuditEvent = {
  action: SponsorAuditAction;
  entityType: SponsorAuditEntity;
  entityId: string;
  /** The acting user; null for system jobs (cron, public opt-out link). */
  actorId: string | null;
  actorRole: string;
  metadata?: SponsorAuditMetadata;
};

/** Writes the events in the caller's transaction, as one statement; nothing when empty. */
export async function writeSponsorAudit(
  tx: TenantTransaction,
  tenantId: string,
  events: readonly SponsorAuditEvent[]
): Promise<void> {
  if (events.length === 0) return;
  await tx.insert(auditLog).values(
    events.map(event => ({
      id: `aud_${nanoid()}`,
      tenantId,
      actorId: event.actorId,
      actorRole: event.actorRole,
      action: event.action,
      entityType: event.entityType,
      entityId: event.entityId,
      metadata: { ...event.metadata },
    }))
  );
}

/** The system actor of sponsor jobs and of the public opt-out link. */
export const SPONSOR_SYSTEM_ACTOR = { actorId: null, actorRole: 'system' } as const;
