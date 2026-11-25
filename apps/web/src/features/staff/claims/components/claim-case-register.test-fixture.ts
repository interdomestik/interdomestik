import type { CaseAuthorityEntry } from '@interdomestik/domain-claims/claims/case-authorities';
import type { ClaimCorrespondenceEntry } from '@interdomestik/domain-claims/claims/correspondence-read';

export const claimId = 'claim-a';
export const occurredAt = '2026-01-02T12:30:00.000Z';
export const documents = [{ id: 'doc-a', name: 'Synthetic instrument.pdf' }];

export const recovery: CaseAuthorityEntry = {
  id: 'basis-a',
  kind: 'recovery_agreement',
  scope: 'recovery',
  evidenceDocumentId: 'doc-a',
  version: 'v1',
  jurisdictionCountryCode: null,
  jurisdictionAttestedByUserId: null,
  jurisdictionAttestedAt: null,
  purpose: null,
  grantedAt: occurredAt,
  expiresAt: null,
  revokedAt: null,
  revokedByUserId: null,
  recordedByStaffId: 'staff-a',
  createdAt: occurredAt,
};
export const representation: CaseAuthorityEntry = {
  ...recovery,
  id: 'basis-b',
  kind: 'power_of_attorney',
  scope: 'representation',
};
export const consent: CaseAuthorityEntry = {
  ...recovery,
  id: 'basis-c',
  kind: 'consent_or_lawful_basis',
  scope: 'document_sharing',
  purpose: 'Synthetic disclosure',
};

export const outbound: ClaimCorrespondenceEntry = {
  id: 'contact-a',
  direction: 'outbound',
  partyKind: 'insurer',
  partyOrganisation: 'Synthetic insurer',
  partyReference: null,
  partyContactName: null,
  channel: 'email',
  occurredAt,
  body: 'Synthetic outgoing contact',
  inReplyToId: null,
  recoveryAuthorityId: recovery.id,
  representationAuthorityId: representation.id,
  sharingAuthorityId: null,
  sharingAttestedByUserId: null,
  sharingAttestedAt: null,
  followUpAt: occurredAt,
  decidedAt: occurredAt,
  recordedByStaffId: 'staff-a',
  createdAt: occurredAt,
  answered: false,
  overdue: true,
  sharedDocumentIds: [],
};
