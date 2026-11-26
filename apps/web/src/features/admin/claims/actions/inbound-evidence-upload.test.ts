import { createHash } from 'node:crypto';
import { buildEvidenceStoragePath } from '@/features/claims/upload/server/storage-path';
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

async function issue(content = bytes) {
  const file = new File([content], fileName, { type: mimeType });
  const decision = {
    id: decisionId,
    tenantId: STAFF_A.tenantId,
    claimId,
    recipientId: 'member-a',
    uploaderId: STAFF_A.id,
    documentId,
    bucket: 'claim-evidence',
    filePath: buildEvidenceStoragePath({
      bucket: 'claim-evidence',
      claimId,
      fileId: documentId,
      fileName,
      shape: 'assigned',
      tenantId: STAFF_A.tenantId,
    }),
    fileName,
    mimeType,
    fileSize: file.size,
    sha256: createHash('sha256').update(content).digest('hex'),
    expiresAt: Date.now() + 60_000,
    published: false,
  };
  mocks.load.mockResolvedValue(decision);
  const issued = await issueInboundEvidenceIntent({ claimId, decisionId });
  if (!issued.success || !issued.data)
    throw new Error('Expected the staff action to issue an intent');
  const form = new FormData();
  form.set('claimId', claimId);
  form.set('intentToken', issued.data.intentToken);
  form.set('file', file);
  return { decision, form };
}

async function issueAndSubmit(content = bytes) {
  const { form } = await issue(content);
  return uploadInboundEvidence(undefined, form);
}

describe('inbound PDF publication', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', 'synthetic-upload-intent-test-secret');
    // The fixture's stored path names this bucket; pin it against a configured override.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET', 'claim-evidence');
    mocks.authorize.mockResolvedValue(authorizedSession(STAFF_A));
    mocks.confirm.mockResolvedValue('created');
    mocks.upload.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

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

  it('submits the publication only after reading back the approved private object', async () => {
    mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    const { decision, form } = await issue();
    expect(await uploadInboundEvidence(undefined, form)).toMatchObject({
      success: true,
      data: { documentId },
    });
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith({
      tenantId: decision.tenantId,
      bucket: decision.bucket,
      path: decision.filePath,
      family: 'claims',
    });
    expect(mocks.confirm).toHaveBeenCalledOnce();
    expect(mocks.download.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.confirm.mock.invocationCallOrder[0]
    );
  });

  it('refuses publication when storage readback fails', async () => {
    mocks.download.mockResolvedValue({ data: null, error: new Error('Synthetic storage failure') });
    expect(await issueAndSubmit()).toMatchObject({ success: false });
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('reports failure when PostgreSQL refuses publication without a receipt', async () => {
    mocks.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    mocks.confirm.mockRejectedValue(
      Object.assign(new Error('Reserved pilot document requires verified storage'), {
        code: 'P1211',
      })
    );
    expect(await issueAndSubmit()).toMatchObject({ success: false });
    expect(mocks.confirm).toHaveBeenCalledOnce();
  });

  it('acknowledges exact expired replay without touching storage or publishing again', async () => {
    const { decision, form } = await issue();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(decision.expiresAt);
    mocks.load.mockResolvedValue({ ...decision, published: true });
    const reissued = await issueInboundEvidenceIntent({ claimId, decisionId });
    expect(reissued).toMatchObject({
      success: true,
      data: { intentToken: form.get('intentToken') },
    });
    expect(await uploadInboundEvidence(undefined, form)).toMatchObject({
      success: true,
      data: { documentId },
    });
    form.set('file', new File([bytes.replace('1.4', '1.5')], fileName, { type: mimeType }));
    expect(await uploadInboundEvidence(undefined, form)).toMatchObject({
      success: false,
      code: 'document_invalid',
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it('refuses an expired first upload before any storage write', async () => {
    const { decision, form } = await issue();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(decision.expiresAt);
    mocks.load.mockResolvedValue(null);
    expect(await issueInboundEvidenceIntent({ claimId, decisionId })).toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    });
    expect(await uploadInboundEvidence(undefined, form)).toMatchObject({
      success: false,
      code: 'FORBIDDEN',
    });
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
