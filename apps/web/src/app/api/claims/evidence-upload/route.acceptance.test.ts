import {
  createEvidenceUploadRequest,
  evidenceUploadMocks as hoisted,
  resetEvidenceUploadMocks,
} from './route.test-support';
import { refuseAcceptance } from '@/test/member-acceptance.test-support';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST } from './route';

describe('POST /api/claims/evidence-upload member acceptance', () => {
  beforeEach(resetEvidenceUploadMocks);

  it('refuses before protected work when acceptance is missing', async () => {
    refuseAcceptance();
    hoisted.getSession.mockResolvedValue({
      user: { id: 'fixture-member', role: 'member', tenantId: 'tenant_mk' },
    });
    const request = createEvidenceUploadRequest();
    const response = await POST(request);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'acceptance_required' });
    expect(request.formData).not.toHaveBeenCalled();
    expect(hoisted.findOwnedMemberUploadClaim).not.toHaveBeenCalled();
    expect(hoisted.upload).not.toHaveBeenCalled();
  });
});
