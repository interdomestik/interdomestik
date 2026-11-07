import { claimDocumentAiExtractionConsents } from '@interdomestik/database';
import { evaluateConsentRequirement, type ConsentEvent } from '@interdomestik/domain-privacy';
import { and, desc, eq } from 'drizzle-orm';

import type { ClaimAiConsentGrant } from './ai-workflow-types';

type ConsentRow = {
  id: string;
  tenantId: string;
  actorId: string;
  subjectId: string;
  claimId: string;
  documentId: string;
  consentType: 'ai_document_extraction';
  processingPurpose: 'ai_document_extraction';
  status: 'accepted' | 'withdrawn';
  privacyVersion: string;
  locale: string;
  sourceSurface: string;
  recordedAt: Date | string;
  grantedAt?: Date | string | null;
  withdrawnAt?: Date | string | null;
};

type ConsentSelectableTx = {
  select: (fields: Record<string, unknown>) => {
    from: (table: unknown) => {
      where: (condition: unknown) => {
        orderBy: (...order: unknown[]) => {
          limit: (limit: number) => Promise<ConsentRow[]>;
        };
      };
    };
  };
};

export type ClaimDocumentAiConsentResolution =
  | { kind: 'granted'; grant: ClaimAiConsentGrant }
  | { kind: 'blocked'; reason: string };

function toIso(value: Date | string | null | undefined): string | undefined {
  if (value == null) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function toConsentEvent(row: ConsentRow): ConsentEvent {
  const recordedAt = toIso(row.recordedAt) ?? '';

  return {
    id: row.id,
    tenantId: row.tenantId,
    actorId: row.actorId,
    subjectId: row.subjectId,
    scope: { claimId: row.claimId, documentId: row.documentId },
    consentType: row.consentType,
    purpose: row.processingPurpose,
    lawfulBasis: 'consent',
    privacyVersion: row.privacyVersion,
    locale: row.locale,
    status: row.status,
    recordedAt,
    ...(row.status === 'accepted' ? { acceptedAt: toIso(row.grantedAt) ?? recordedAt } : {}),
    ...(row.status === 'withdrawn' ? { withdrawnAt: toIso(row.withdrawnAt) ?? recordedAt } : {}),
    sourceSurface: row.sourceSurface,
  };
}

function canSelectConsent(tx: unknown): tx is ConsentSelectableTx {
  return typeof (tx as { select?: unknown }).select === 'function';
}

export async function resolveClaimDocumentAiExtractionConsent(params: {
  tx: unknown;
  tenantId: string;
  subjectId: string;
  claimId: string;
  documentId: string;
}): Promise<ClaimDocumentAiConsentResolution> {
  if (!canSelectConsent(params.tx)) {
    return { kind: 'blocked', reason: 'consent_resolver_unavailable' };
  }

  const [row] = await params.tx
    .select({
      id: claimDocumentAiExtractionConsents.id,
      tenantId: claimDocumentAiExtractionConsents.tenantId,
      actorId: claimDocumentAiExtractionConsents.actorId,
      subjectId: claimDocumentAiExtractionConsents.subjectId,
      claimId: claimDocumentAiExtractionConsents.claimId,
      documentId: claimDocumentAiExtractionConsents.documentId,
      consentType: claimDocumentAiExtractionConsents.consentType,
      processingPurpose: claimDocumentAiExtractionConsents.processingPurpose,
      status: claimDocumentAiExtractionConsents.status,
      privacyVersion: claimDocumentAiExtractionConsents.privacyVersion,
      locale: claimDocumentAiExtractionConsents.locale,
      sourceSurface: claimDocumentAiExtractionConsents.sourceSurface,
      recordedAt: claimDocumentAiExtractionConsents.recordedAt,
      grantedAt: claimDocumentAiExtractionConsents.grantedAt,
      withdrawnAt: claimDocumentAiExtractionConsents.withdrawnAt,
    })
    .from(claimDocumentAiExtractionConsents)
    .where(
      and(
        eq(claimDocumentAiExtractionConsents.tenantId, params.tenantId),
        eq(claimDocumentAiExtractionConsents.subjectId, params.subjectId),
        eq(claimDocumentAiExtractionConsents.claimId, params.claimId),
        eq(claimDocumentAiExtractionConsents.documentId, params.documentId),
        eq(claimDocumentAiExtractionConsents.consentType, 'ai_document_extraction'),
        eq(claimDocumentAiExtractionConsents.processingPurpose, 'ai_document_extraction')
      )
    )
    .orderBy(desc(claimDocumentAiExtractionConsents.recordedAt))
    .limit(1);

  if (!row) return { kind: 'blocked', reason: 'consent_missing' };

  const event = toConsentEvent(row);
  const decision = evaluateConsentRequirement([event], {
    tenantId: params.tenantId,
    subjectId: params.subjectId,
    consentType: 'ai_document_extraction',
    purpose: 'ai_document_extraction',
    scope: { claimId: params.claimId, documentId: params.documentId },
  });

  return decision.kind === 'allowed'
    ? { kind: 'granted', grant: { consentEventId: event.id, recordedAt: event.recordedAt } }
    : { kind: 'blocked', reason: decision.reasons[0] ?? 'consent_blocked' };
}
