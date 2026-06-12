import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ERASURE_REDACTED_VALUE,
  ERASURE_RENDER_STORES,
  redactAuditMetadataForErasure,
  renderClaimDocumentForErasedSubject,
  renderClaimForErasedSubject,
  renderMemberNoteForErasedSubject,
  renderTimelineEventAfterErasure,
} from '../src/domain-event-erasure-render';

describe('domain event erasure render contract', () => {
  it('covers the T-104h residue stores', () => {
    assert.deepEqual(
      [...ERASURE_RENDER_STORES],
      [
        'domain_events',
        'event_pii_references',
        'audit_log.metadata',
        'claim',
        'claim_documents',
        'member_notes',
      ]
    );
  });

  it('keeps the timeline event skeleton when PII is erased', () => {
    const createdAt = new Date('2026-06-12T12:00:00Z');
    assert.deepEqual(
      renderTimelineEventAfterErasure(
        {
          aggregateVersion: 7,
          createdAt,
          entityId: 'claim-1',
          entityType: 'claim',
          eventName: 'claim.status_changed',
          eventVersion: 1,
          id: 'event-1',
          tenantId: 'tenant-1',
        },
        { status: 'erased_or_unavailable' }
      ),
      {
        aggregateVersion: 7,
        createdAt,
        entityId: 'claim-1',
        entityType: 'claim',
        eventName: 'claim.status_changed',
        eventVersion: 1,
        id: 'event-1',
        pii: { reason: 'erased_or_unavailable', status: 'redacted' },
        tenantId: 'tenant-1',
      }
    );
  });

  it('redacts raw network metadata without dropping audit context', () => {
    const inheritedMetadata = Object.create({ ipAddress: '198.51.100.99' }) as Record<
      string,
      unknown
    >;
    inheritedMetadata.correlationId = 'corr-inherited';

    assert.deepEqual(redactAuditMetadataForErasure(inheritedMetadata), {
      correlationId: 'corr-inherited',
    });

    assert.deepEqual(
      redactAuditMetadataForErasure({
        correlationId: 'corr-1',
        ipAddress: '198.51.100.10',
        rawUserAgent: 'Browser/1.0',
      }),
      {
        correlationId: 'corr-1',
        ipAddress: ERASURE_REDACTED_VALUE,
        rawUserAgent: ERASURE_REDACTED_VALUE,
      }
    );
  });

  it('renders claim, document, and member-note rows without subject plaintext', () => {
    const createdAt = new Date('2026-06-12T12:00:00Z');
    const claim = renderClaimForErasedSubject({
      caseLifecycleState: 'submitted',
      claimNumber: 'KS-1',
      createdAt,
      id: 'claim-1',
      incidentCountryCode: 'KS',
      incidentJurisdiction: 'country:KS',
      publicReference: 'visible-reference',
      recoveryLifecycleState: 'not_started',
      status: 'submitted',
      tenantId: 'tenant-1',
      updatedAt: null,
    });
    assert.equal(claim.title, ERASURE_REDACTED_VALUE);
    assert.equal(claim.userId, ERASURE_REDACTED_VALUE);
    assert.equal(claim.status, 'submitted');
    assert.equal(claim.publicReference, 'visible-reference');

    const document = renderClaimDocumentForErasedSubject({
      category: 'evidence',
      claimId: 'claim-1',
      classification: 'pii',
      createdAt,
      fileSize: 12,
      id: 'doc-1',
      reviewState: 'accepted',
      tenantId: 'tenant-1',
    });
    assert.equal(document.filePath, null);
    assert.equal(document.name, ERASURE_REDACTED_VALUE);
    assert.equal(document.reviewState, 'accepted');

    const note = renderMemberNoteForErasedSubject({
      createdAt,
      id: 'note-1',
      isInternal: true,
      isPinned: false,
      followUpState: 'none',
      tenantId: 'tenant-1',
      type: 'general',
      updatedAt: null,
    });
    assert.equal(note.content, ERASURE_REDACTED_VALUE);
    assert.equal(note.memberId, ERASURE_REDACTED_VALUE);
    assert.equal(note.followUpState, 'none');
  });
});
