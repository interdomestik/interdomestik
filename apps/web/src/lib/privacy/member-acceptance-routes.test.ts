// @vitest-environment node
import { acceptanceMocks } from './member-acceptance-denial.test-support';
import { describe, expect, it, vi } from 'vitest';
import { POST as evidenceUpload } from '@/app/api/claims/evidence-upload/route';
import { POST as policyAnalysis } from '@/app/api/policies/analyze/route';
import {
  GET as getNotifications,
  POST as saveNotifications,
} from '@/app/api/settings/notifications/route';
import { DELETE as deletePush, POST as savePush } from '@/app/api/settings/push/route';
import { POST as createSharePack } from '@/app/api/share-pack/route';
import { POST as createUpload } from '@/app/api/uploads/route';

const protectedCalls = vi.hoisted(() => ({
  evidence: vi.fn(),
  informationRequest: vi.fn(),
  adminEvidence: vi.fn(),
  policy: vi.fn(),
  readNotifications: vi.fn(),
  writeNotifications: vi.fn(),
  savePush: vi.fn(),
  deletePush: vi.fn(),
  sharePack: vi.fn(),
  upload: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/features/claims/upload/server/access', () => ({
  findOwnedMemberUploadClaim: protectedCalls.evidence,
  findOwnedMemberInformationRequest: protectedCalls.informationRequest,
  findAccessibleAdminUploadClaim: protectedCalls.adminEvidence,
}));
vi.mock('@/app/api/policies/analyze/_core', () => ({ analyzePolicyCore: protectedCalls.policy }));
vi.mock('@/app/api/settings/notifications/_core', () => ({
  getNotificationPreferencesCore: protectedCalls.readNotifications,
  upsertNotificationPreferencesCore: protectedCalls.writeNotifications,
}));
vi.mock('@/app/api/settings/push/_core', () => ({
  upsertPushSubscriptionCore: protectedCalls.savePush,
  deletePushSubscriptionCore: protectedCalls.deletePush,
}));
vi.mock('@/app/api/share-pack/_core', () => ({ createSharePackCore: protectedCalls.sharePack }));
vi.mock('@/app/api/uploads/_core', async importOriginal => ({
  ...(await importOriginal<typeof import('@/app/api/uploads/_core')>()),
  createSignedUploadCore: protectedCalls.upload,
}));
vi.mock('@/lib/audit', () => ({ logAuditEvent: protectedCalls.audit }));
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimit: () => Promise.resolve(null) }));

describe('member acceptance on public routes', () => {
  it.each([
    ['POST', '/api/claims/evidence-upload', evidenceUpload],
    ['POST', '/api/policies/analyze', policyAnalysis],
    ['GET', '/api/settings/notifications', getNotifications],
    ['POST', '/api/settings/notifications', saveNotifications],
    ['POST', '/api/settings/push', savePush],
    ['DELETE', '/api/settings/push', deletePush],
    ['POST', '/api/share-pack', createSharePack],
    ['POST', '/api/uploads', createUpload],
  ] as const)(
    '%s %s refuses before body parsing or protected work',
    async (method, path, route) => {
      const request = new Request(`https://example.test${path}`, { method });
      const parseJson = vi.spyOn(request, 'json');
      const parseForm = vi.spyOn(request, 'formData');
      const response = await route(request);

      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({ error: 'acceptance_required' });
      expect(parseJson).not.toHaveBeenCalled();
      expect(parseForm).not.toHaveBeenCalled();
      for (const call of Object.values(protectedCalls)) expect(call).not.toHaveBeenCalled();
    }
  );

  it('rechecks the current version on the next request after a successful preferences read', async () => {
    const request = () => new Request('https://example.test/api/settings/notifications');
    acceptanceMocks.readAcceptance.mockResolvedValueOnce({ accepted: true });
    protectedCalls.readNotifications.mockResolvedValueOnce({ emailEnabled: true });

    const first = await getNotifications(request());
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toEqual({ emailEnabled: true });

    const second = await getNotifications(request());
    expect(second.status).toBe(403);
    await expect(second.json()).resolves.toEqual({ error: 'acceptance_required' });
    expect(protectedCalls.readNotifications).toHaveBeenCalledOnce();
  });
});
