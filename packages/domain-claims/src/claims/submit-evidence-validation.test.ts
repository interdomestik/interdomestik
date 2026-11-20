import './submit-test-mocks';
import { describe, expect, it, vi } from 'vitest';

import { MAX_CLAIM_EVIDENCE_FILES } from '../validators/claims';
import {
  buildEvidenceFile,
  buildEvidenceFiles,
  buildSubmitArgs,
  txInsert,
} from './submit-test-support';
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

it.each([
  ['heic', 'image/heic', 100],
  ['docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 100],
  ['mp4', 'video/mp4', 50 * 1024 * 1024],
] as const)(
  'submits initial .%s through the shared policy and object validator',
  async (ext, type, size) => {
    const file = buildEvidenceFile({
      name: `evidence.${ext}`,
      path: `pii/tenants/tenant-1/claims/member-1/unassigned/upload-1-evidence.${ext}`,
      type,
      size,
    });
    const validateSubmittedClaimFile = vi.fn().mockResolvedValue(undefined);
    expect(
      await submitClaimCore(buildSubmitArgs({ files: [file] }), { validateSubmittedClaimFile })
    ).toMatchObject({ success: true });
    expect(validateSubmittedClaimFile).toHaveBeenCalledWith(expect.objectContaining({ file }));
    expect(txInsert).toHaveBeenCalled();
  }
);

it.each([
  ['pdf', 'application/pdf', 10 * 1024 * 1024 + 1, 'evidence_too_large'],
  ['mp4', 'video/mp4', 50 * 1024 * 1024 + 1, 'evidence_too_large'],
  ['txt', 'text/plain', 100, 'evidence_unsupported'],
] as const)('rejects initial .%s size %s/%s before persistence', async (ext, type, size, error) => {
  const validateSubmittedClaimFile = vi.fn().mockResolvedValue(undefined);
  const file = buildEvidenceFile({ name: `evidence.${ext}`, type, size });
  await expect(
    submitClaimCore(buildSubmitArgs({ files: [file] }), { validateSubmittedClaimFile })
  ).rejects.toThrow(error);
  expect(txInsert).not.toHaveBeenCalled();
});

it('validates all batch metadata before starting any object validation', async () => {
  const validateSubmittedClaimFile = vi.fn().mockRejectedValue(new Error('Storage unavailable'));
  const files = [
    buildEvidenceFile(),
    buildEvidenceFile({ name: 'invalid.txt', type: 'text/plain' }),
  ];
  await expect(
    submitClaimCore(buildSubmitArgs({ files }), { validateSubmittedClaimFile })
  ).rejects.toThrow('evidence_unsupported');
  expect(validateSubmittedClaimFile).not.toHaveBeenCalled();
  expect(txInsert).not.toHaveBeenCalled();
});
