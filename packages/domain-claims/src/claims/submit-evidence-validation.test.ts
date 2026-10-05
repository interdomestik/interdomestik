import './submit-test-mocks';
import { describe, expect, it, vi } from 'vitest';

import { MAX_CLAIM_EVIDENCE_FILES } from '../validators/claims';
import { buildEvidenceFiles, buildSubmitArgs, txInsert } from './submit-test-support';
import { submitClaimCore } from './submit';

describe('submitClaimCore evidence validation', () => {
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
