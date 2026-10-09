import { getUploadActionMocks } from './actions.test-support';
import { confirmUpload, generateUploadUrl } from './actions';
import { describe, expect, it } from 'vitest';
import { createConfirmUploadParams } from './actions.test-fixtures';

const hoisted = getUploadActionMocks();

const ROLE_CASES = [
  ['member', 'member'],
  ['user', 'member'],
  ['agent', 'member'],
  ['admin', 'admin'],
  ['tenant_admin', 'tenant_admin'],
  ['super_admin', 'super_admin'],
  ['staff', 'staff'],
  ['branch_manager', 'branch_manager'],
] as const;

describe('member upload trusted canonical actor', () => {
  it.each(ROLE_CASES)(
    'preserves the %s actor as %s through lookup and metadata',
    async (role, actorRole) => {
      hoisted.authGetSession.mockResolvedValue({
        user: { id: 'member-1', tenantId: 'tenant-1', role },
      });
      expect(
        (await generateUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024)).success
      ).toBe(true);
      expect(hoisted.findOwnedMemberUploadClaim).toHaveBeenLastCalledWith({
        claimId: 'claim-1',
        tenantId: 'tenant-1',
        userId: 'member-1',
        role: actorRole,
      });
      await expect(confirmUpload(createConfirmUploadParams())).resolves.toEqual({ success: true });
      expect(hoisted.withTenantContext).toHaveBeenCalledWith(
        { tenantId: 'tenant-1', role: actorRole },
        expect.any(Function)
      );
    }
  );

  it.each([null, undefined])(
    'denies a missing actor role %s before lookup or write',
    async role => {
      hoisted.authGetSession.mockResolvedValue({
        user: { id: 'member-1', tenantId: 'tenant-1', role },
      });
      await expect(
        generateUploadUrl('claim-1', 'evidence.pdf', 'application/pdf', 1024)
      ).resolves.toEqual({ success: false, error: 'Unauthorized', status: 401 });
      await expect(confirmUpload(createConfirmUploadParams())).resolves.toEqual({
        success: false,
        error: 'Unauthorized',
        status: 401,
      });
      expect(hoisted.findOwnedMemberUploadClaim).not.toHaveBeenCalled();
      expect(hoisted.withTenantContext).not.toHaveBeenCalled();
      expect(hoisted.insert).not.toHaveBeenCalled();
    }
  );
  it('returns a safe conflict when ownership changed after lookup but before metadata persistence', async () => {
    hoisted.metadataClaimRows.mockResolvedValueOnce([]);
    await expect(confirmUpload(createConfirmUploadParams())).resolves.toEqual({
      success: false,
      status: 409,
      error: 'Upload changed. Reload the case and check its documents.',
    });
    expect(hoisted.findOwnedMemberUploadClaim).toHaveBeenCalledTimes(1);
    expect(hoisted.insert).not.toHaveBeenCalled();
    expect(hoisted.queueClaimDocumentAiWorkflows).not.toHaveBeenCalled();
    expect(hoisted.revalidatePath).not.toHaveBeenCalled();
  });
});
