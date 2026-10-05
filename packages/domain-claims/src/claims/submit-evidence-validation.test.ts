import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@interdomestik/database', async () =>
  (await import('./submit-test-support')).databaseModuleMock()
);
vi.mock('@interdomestik/database/tenant-security', async () =>
  (await import('./submit-test-support')).tenantSecurityModuleMock()
);
vi.mock('drizzle-orm', async () => (await import('./submit-test-support')).drizzleModuleMock());
vi.mock('@interdomestik/database/claim-number', async () => ({
  generateClaimNumber: (await import('./submit-test-support')).generateClaimNumberMock,
}));
vi.mock('@interdomestik/database/tenant-directory', async () => ({
  readTenantLocaleMetadata: (await import('./submit-test-support')).readTenantLocaleMetadataMock,
}));
vi.mock('@interdomestik/domain-membership-billing/subscription', async () => ({
  getActiveSubscription: (await import('./submit-test-support')).getActiveSubscriptionMock,
}));
vi.mock('@interdomestik/shared-auth', async () => ({
  ensureTenantId: (await import('./submit-test-support')).ensureTenantIdMock,
}));
vi.mock('nanoid', async () => ({ nanoid: (await import('./submit-test-support')).nanoidMock }));
vi.mock('./ai-workflows', async () => ({
  queueClaimDocumentAiWorkflows: (await import('./submit-test-support'))
    .queueClaimDocumentAiWorkflowsMock,
}));

import { MAX_CLAIM_EVIDENCE_FILES } from '../validators/claims';
import {
  buildEvidenceFiles,
  buildSubmitArgs,
  resetSubmitClaimMocks,
  txInsert,
} from './submit-test-support';
import { submitClaimCore } from './submit';

describe('submitClaimCore evidence validation', () => {
  beforeEach(() => {
    resetSubmitClaimMocks();
  });

  it('rejects evidence when object validation fails before writes', async () => {
    const validateSubmittedClaimFile = vi
      .fn()
      .mockRejectedValue(new Error('Uploaded file was not found. Please retry upload.'));

    await expect(
      submitClaimCore(buildSubmitArgs(), { validateSubmittedClaimFile })
    ).rejects.toThrow('Uploaded file was not found. Please retry upload.');

    expect(validateSubmittedClaimFile).toHaveBeenCalledOnce();
    expect(txInsert).not.toHaveBeenCalled();
  });

  it('fails when evidence validation is not wired', async () => {
    await expect(submitClaimCore(buildSubmitArgs())).rejects.toThrow(
      'Submitted claim file validation is not configured.'
    );

    expect(txInsert).not.toHaveBeenCalled();
  });

  it('rejects too many evidence files before writes', async () => {
    const validateSubmittedClaimFile = vi.fn().mockResolvedValue(undefined);

    await expect(
      submitClaimCore(
        buildSubmitArgs({ files: buildEvidenceFiles(MAX_CLAIM_EVIDENCE_FILES + 1) }),
        {
          validateSubmittedClaimFile,
        }
      )
    ).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });

    expect(validateSubmittedClaimFile).not.toHaveBeenCalled();
    expect(txInsert).not.toHaveBeenCalled();
  });
});
