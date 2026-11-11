import {
  ROLE_ADMIN,
  ROLE_BRANCH_MANAGER,
  ROLE_STAFF,
  ROLE_SUPER_ADMIN,
  ROLE_TENANT_ADMIN,
} from '@/lib/roles.core';
import { describe, expect, it } from 'vitest';
import {
  redactVerificationDetailsForRole,
  redactVerificationRequestsForRole,
} from './branch-manager-redaction';
import {
  expectNoDocumentContent,
  verificationDetails,
  verificationRequest,
} from './branch-manager-redaction.test-fixtures';

describe('D1 verification server payload redaction', () => {
  it('redacts list document identifiers and paths without mutating the query rows', () => {
    const requests = [verificationRequest];
    const before = JSON.stringify(requests);
    const result = redactVerificationRequestsForRole(requests, ROLE_BRANCH_MANAGER);

    expect(result).toEqual([
      { ...verificationRequest, documentId: null, documentPath: null, verificationNote: null },
    ]);
    expectNoDocumentContent(result);
    expect(JSON.stringify(requests)).toBe(before);
  });

  it('keeps document events, drops their descriptions and replaces embedded document IDs', () => {
    const before = JSON.stringify(verificationDetails);
    const result = redactVerificationDetailsForRole(verificationDetails, ROLE_BRANCH_MANAGER)!;

    expect(result).toMatchObject({
      documentId: null,
      documentPath: null,
      documents: [],
    });
    expect(result.timeline.map(event => event.type)).toEqual([
      'document_upload',
      'action',
      'document_upload',
    ]);
    const uploads = result.timeline.filter(event => event.type === 'document_upload');
    expect(new Set(uploads.map(event => event.id)).size).toBe(2);
    for (const event of uploads) {
      expect(event.description).toBeUndefined();
      expect(event.title).toBe('Proof Uploaded');
      expect(event.date).toEqual(new Date('2026-01-02T00:00:00Z'));
    }
    expectNoDocumentContent(result);
    for (const event of result.timeline) expect(event.description).toBeUndefined();
    expect(Object.keys(result).sort((a, b) => a.localeCompare(b))).toEqual(
      Object.keys(verificationDetails).sort((a, b) => a.localeCompare(b))
    );
    expect(result.verificationNote).toBeNull();
    expect(JSON.stringify(verificationDetails)).toBe(before);
  });

  it.each([
    'member',
    'agent',
    'global_support',
    'auditor',
    ROLE_STAFF,
    ROLE_ADMIN,
    ROLE_TENANT_ADMIN,
    ROLE_SUPER_ADMIN,
    null,
    undefined,
    'branch_manager_other',
  ])('leaves role %j payloads byte-for-byte unchanged', role => {
    const requests = [verificationRequest];
    const before = JSON.stringify({ requests, details: verificationDetails });

    expect(redactVerificationRequestsForRole(requests, role)).toBe(requests);
    expect(redactVerificationDetailsForRole(verificationDetails, role)).toBe(verificationDetails);
    expect(JSON.stringify({ requests, details: verificationDetails })).toBe(before);
  });

  it('preserves empty lists, missing proof and not-found details', () => {
    expect(redactVerificationRequestsForRole([], ROLE_BRANCH_MANAGER)).toEqual([]);
    const withoutProof = {
      ...verificationRequest,
      documentId: null,
      documentPath: null,
      verificationNote: null,
    };
    expect(redactVerificationRequestsForRole([withoutProof], ROLE_BRANCH_MANAGER)).toEqual([
      withoutProof,
    ]);
    expect(redactVerificationDetailsForRole(null, ROLE_BRANCH_MANAGER)).toBeNull();
    expect(redactVerificationDetailsForRole(null, ROLE_STAFF)).toBeNull();
  });
});
