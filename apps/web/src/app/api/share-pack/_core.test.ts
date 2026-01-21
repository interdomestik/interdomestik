import { describe, expect, it, vi } from 'vitest';
import { createSharePackCore, getSharePackCore, type SharePackServices } from './_core';

describe('Share Pack API Core', () => {
  const mockServices: SharePackServices = {
    createSharePack: vi.fn(),
    getSharePack: vi.fn(),
    logAuditEvent: vi.fn(),
  };

  describe('createSharePackCore', () => {
    it('creates pack and logs audit event on success', async () => {
      const expiresAt = new Date();
      vi.mocked(mockServices.createSharePack).mockResolvedValue({
        packId: 'p1',
        token: 't1',
        expiresAt,
      });

      const result = await createSharePackCore({
        tenantId: 'tenant1',
        userId: 'user1',
        documentIds: ['d1', 'd2'],
        ipAddress: '1.2.3.4',
        userAgent: 'test-agent',
        services: mockServices,
      });

      expect(result.ok).toBe(true);
      expect(result.data?.packId).toBe('p1');
      expect(mockServices.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          shareToken: 't1',
          ids: ['d1', 'd2'],
        })
      );
    });

    it('returns error for invalid IDs', async () => {
      vi.mocked(mockServices.createSharePack).mockRejectedValue(new Error('Invalid IDs'));

      const result = await createSharePackCore({
        tenantId: 'tenant1',
        userId: 'user1',
        documentIds: ['bad1'],
        services: mockServices,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Invalid IDs');
    });
  });

  describe('getSharePackCore', () => {
    it('fetches pack and logs audit event on success', async () => {
      vi.mocked(mockServices.getSharePack).mockResolvedValue({
        pack: { id: 'p1', expiresAt: new Date() },
        docs: [{ id: 'd1', fileName: 'file1.pdf', mimeType: 'pdf', fileSize: 100 }],
        tenantId: 'tenant1',
      });

      const result = await getSharePackCore({
        token: 'token1',
        ipAddress: '1.2.3.4',
        userAgent: 'test-agent',
        services: mockServices,
      });

      expect(result.ok).toBe(true);
      expect(result.data?.documents[0].id).toBe('d1');
      expect(mockServices.logAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          shareToken: 'token1',
        })
      );
    });

    it('returns 404-style error when pack not found', async () => {
      vi.mocked(mockServices.getSharePack).mockResolvedValue(null);

      const result = await getSharePackCore({
        token: 'bad-token',
        services: mockServices,
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Pack not found');
    });
  });
});
