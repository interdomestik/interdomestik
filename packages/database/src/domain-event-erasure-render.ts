export const ERASURE_REDACTED_VALUE = '[erased]';

export const ERASURE_RENDER_STORES = [
  'domain_events',
  'event_pii_references',
  'audit_log.metadata',
  'claim',
  'claim_documents',
  'member_notes',
] as const;

export type ErasureRenderStore = (typeof ERASURE_RENDER_STORES)[number];

type TimelineEventInput = {
  aggregateVersion: number;
  createdAt: Date;
  entityId: string;
  entityType: string;
  eventName: string;
  eventVersion: number;
  id: string;
  tenantId: string;
};

type EventPiiRead = { status: 'available' } | { status: 'erased_or_unavailable' };

export function renderTimelineEventAfterErasure(event: TimelineEventInput, pii: EventPiiRead) {
  return {
    aggregateVersion: event.aggregateVersion,
    createdAt: event.createdAt,
    entityId: event.entityId,
    entityType: event.entityType,
    eventName: event.eventName,
    eventVersion: event.eventVersion,
    id: event.id,
    pii:
      pii.status === 'erased_or_unavailable'
        ? { reason: 'erased_or_unavailable' as const, status: 'redacted' as const }
        : { status: 'reference_available' as const },
    tenantId: event.tenantId,
  };
}

export function redactAuditMetadataForErasure(metadata: Record<string, unknown>) {
  const redacted = { ...metadata };
  for (const key of ['ip', 'ipAddress', 'rawIp', 'requestIp', 'userAgent', 'rawUserAgent']) {
    if (Object.hasOwn(redacted, key)) {
      redacted[key] = ERASURE_REDACTED_VALUE;
    }
  }
  return redacted;
}

type ClaimRenderInput = {
  caseLifecycleState: string | null;
  claimNumber: string | null;
  createdAt: Date | null;
  id: string;
  incidentCountryCode: string | null;
  incidentJurisdiction: string | null;
  recoveryLifecycleState: string | null;
  status: string | null;
  tenantId: string;
  updatedAt: Date | null;
};

export function renderClaimForErasedSubject<T extends ClaimRenderInput>(claim: T) {
  return {
    ...claim,
    assignedById: ERASURE_REDACTED_VALUE,
    companyName: ERASURE_REDACTED_VALUE,
    description: null,
    title: ERASURE_REDACTED_VALUE,
    userId: ERASURE_REDACTED_VALUE,
  };
}

type ClaimDocumentRenderInput = {
  category: string;
  claimId: string;
  classification: string;
  createdAt: Date | null;
  fileSize: number;
  id: string;
  tenantId: string;
};

export function renderClaimDocumentForErasedSubject<T extends ClaimDocumentRenderInput>(
  document: T
) {
  return {
    ...document,
    filePath: null,
    fileType: ERASURE_REDACTED_VALUE,
    name: ERASURE_REDACTED_VALUE,
    uploadedBy: ERASURE_REDACTED_VALUE,
  };
}

type MemberNoteRenderInput = {
  createdAt: Date;
  id: string;
  isInternal: boolean;
  isPinned: boolean;
  tenantId: string;
  type: string;
  updatedAt: Date | null;
};

export function renderMemberNoteForErasedSubject<T extends MemberNoteRenderInput>(note: T) {
  return {
    ...note,
    authorId: ERASURE_REDACTED_VALUE,
    content: ERASURE_REDACTED_VALUE,
    memberId: ERASURE_REDACTED_VALUE,
  };
}
