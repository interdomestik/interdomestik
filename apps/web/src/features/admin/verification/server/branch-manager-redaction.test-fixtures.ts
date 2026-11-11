import { expect } from 'vitest';
import type { CashVerificationDetailsDTO } from './types';

const uploadedAt = new Date('2026-01-02T00:00:00Z');

export const verificationDetails: CashVerificationDetailsDTO = {
  id: 'attempt-1',
  leadId: 'lead-1',
  firstName: 'Test',
  lastName: 'Lead',
  email: 'lead@example.test',
  amount: 1000,
  currency: 'EUR',
  status: 'pending',
  isResubmission: false,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: uploadedAt,
  branchId: 'branch-1',
  branchCode: 'B1',
  branchName: 'Branch',
  agentId: 'agent-1',
  agentName: 'Agent',
  agentEmail: 'agent@example.test',
  documentId: 'private-document-1',
  documentPath: 'private-bucket/tenant/proof-private.pdf',
  verificationNote: 'VERIFICATION-NOTE-SENTINEL',
  verifierName: null,
  documents: [
    {
      id: 'private-document-1',
      name: 'proof-private.pdf',
      url: '/api/documents/private-document-1/download',
      uploadedAt,
    },
    {
      id: 'private-document-2',
      name: 'second-private.pdf',
      url: 'https://storage.example.test/signed-private-proof',
      uploadedAt,
    },
  ],
  timeline: [
    {
      id: 'doc-private-document-1',
      type: 'document_upload',
      title: 'Proof Uploaded',
      description: 'proof-private.pdf',
      date: uploadedAt,
    },
    {
      id: 'log-1',
      type: 'action',
      title: 'Requested Info',
      description: 'ACTION-DESCRIPTION-SENTINEL',
      date: uploadedAt,
      actorName: 'Staff',
    },
    {
      id: 'doc-private-document-2',
      type: 'document_upload',
      title: 'Proof Uploaded',
      description: 'second-private.pdf',
      date: uploadedAt,
    },
  ],
};

const { documents, timeline, ...request } = verificationDetails;
export const verificationRequest = request;

/** Inspect the serialized client payload as well as its known document fields. */
export function expectNoDocumentContent(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toContain(verificationDetails.verificationNote!);
  for (const event of timeline)
    if (event.description) expect(serialized).not.toContain(event.description);
  for (const doc of documents) {
    expect(serialized).not.toContain(doc.id);
    expect(serialized).not.toContain(doc.name);
    expect(serialized).not.toContain(doc.url);
  }
  expect(serialized).not.toContain(verificationDetails.documentPath!);
  for (const event of timeline.filter(event => event.type === 'document_upload')) {
    expect(serialized).not.toContain(event.id);
  }
}
