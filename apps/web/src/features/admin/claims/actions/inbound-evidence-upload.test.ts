import { createHash } from 'node:crypto';
import { authorizedSession, STAFF_A } from '@/test/safe-action-harness';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(),
  load: vi.fn(),
  upload: vi.fn(),
  download: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock('@/lib/tenant-authority.server', () => ({ authorizeSessionTenant: mocks.authorize }));
vi.mock('@/lib/audit.core', () => ({ writeAuditEvent: vi.fn(async () => ({ ok: true })) }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn(), setUser: vi.fn(), setTag: vi.fn() }));
vi.mock('@/features/claims/upload/server/claim-upload-cutover', () => ({
  isClaimUploadPaused: async () => false,
}));
vi.mock('@/features/claims/upload/server/shared-upload', () => ({
  revalidatePathForAllLocales: vi.fn(),
}));
vi.mock('@/lib/storage/service-role', () => ({
  uploadTenantObject: mocks.upload,
  downloadTenantObject: mocks.download,
}));
vi.mock('@interdomestik/domain-documents/claim-evidence', () => ({
  confirmClaimEvidence: mocks.confirm,
}));
vi.mock('@interdomestik/database/free-start-drafts', () => ({
  withPrincipalTenantContext: async (_authority: unknown, work: (tx: object) => unknown) =>
    work({}),
}));
vi.mock('@interdomestik/domain-claims/claims/inbound-upload', async original => ({
  ...(await original<object>()),
  loadInboundUploadDecision: mocks.load,
}));

import { issueInboundEvidenceIntent, uploadInboundEvidence } from './inbound-evidence-upload';

const claimId = 'case-1';
const decisionId = '3c7b22a4-d80a-435e-97cb-320d2473279c';
const documentId = 'wp12-inbound-00112233445566778899001122334455';
const fileName = 'evidence.pdf';
const mimeType = 'application/pdf';
const bytes = '%PDF-1.4\n%%EOF';

async function issueAndSubmit(content = bytes) {
  const file = new File([content], fileName, { type: mimeType });
  mocks.load.mockResolvedValue({
    id: decisionId,
    tenantId: STAFF_A.tenantId,
    claimId,
    recipientId: 'member-a',
    uploaderId: STAFF_A.id,
    documentId,
    bucket: 'claim-evidence',
    filePath: `pii/tenants/${STAFF_A.tenantId}/claims/${claimId}/${documentId}.pdf`,
    fileName,
    mimeType,
    fileSize: file.size,
    sha256: createHash('sha256').update(content).digest('hex'),
    expiresAt: Date.now() + 60_000,
  });
  const issued = await issueInboundEvidenceIntent({ claimId, decisionId });
  if (!issued.success || !issued.data)
    throw new Error('Expected the staff action to issue an intent');
  const form = new FormData();
  form.set('claimId', claimId);
  form.set('intentToken', issued.data.intentToken);
  form.set('file', file);
  return uploadInboundEvidence(undefined, form);
}

describe('inbound PDF publication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', 'synthetic-upload-intent-test-secret');
    mocks.authorize.mockResolvedValue(authorizedSession(STAFF_A));
    mocks.confirm.mockResolvedValue('created');
    mocks.upload.mockResolvedValue({ error: null });
  });
  afterEach(() => vi.unstubAllEnvs());

  it('refuses matching non-PDF bytes before storage', async () => {
    expect(await issueAndSubmit('Synthetic text')).toMatchObject({
      success: false,
      code: 'document_invalid',
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('refuses publication when a successful storage write reads back different bytes', async () => {
    mocks.download.mockResolvedValue({
      data: new Blob([bytes.replace('1.4', '1.5')]),
      error: null,
    });
    expect(await issueAndSubmit()).toMatchObject({ success: false });
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('confirms a successful write after reading back the exact bytes', async () => {
    mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    expect(await issueAndSubmit()).toMatchObject({ success: true, data: { documentId } });
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.confirm).toHaveBeenCalledOnce();
  });
});
