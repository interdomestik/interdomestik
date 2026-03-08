import { describe, expect, it, vi } from 'vitest';
import { analyzePolicyCore, AnalyzePolicyDeps } from './_core';

const mockDeps: AnalyzePolicyDeps = {
  uploadFile: vi.fn().mockResolvedValue({ ok: true, filePath: 'mock/path' }),
  queuePolicyAnalysis: vi.fn().mockResolvedValue({ policyId: 'policy-1', runId: 'run-1' }),
  emitRequestedRun: vi.fn().mockResolvedValue(undefined),
};

const mockFile = (name: string, type: string, size = 1000) => {
  return {
    name,
    type,
    size,
    arrayBuffer: async () => new ArrayBuffer(8),
  } as unknown as File;
};

const mockBuffer = Buffer.from('mock');
const mockSession = { userId: 'u1', tenantId: 't1' };

describe('analyzePolicyCore', () => {
  it('returns BAD_REQUEST for invalid input file', async () => {
    const result = await analyzePolicyCore({
      file: mockFile('test.exe', 'application/x-msdownload'),
      buffer: mockBuffer,
      session: mockSession,
      deps: mockDeps,
    });
    expect(result).toEqual({
      ok: false,
      code: 'BAD_REQUEST',
      message: expect.stringContaining('Only PDF'),
    });
  });

  it('returns PAYLOAD_TOO_LARGE for huge files', async () => {
    const result = await analyzePolicyCore({
      file: mockFile('large.pdf', 'application/pdf', 999_999_999),
      buffer: mockBuffer,
      session: mockSession,
      deps: mockDeps,
    });
    expect(result).toEqual({ ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'File too large' });
  });

  it('queues a valid upload for background analysis', async () => {
    const result = await analyzePolicyCore({
      file: mockFile('policy.jpg', 'image/jpeg'),
      buffer: mockBuffer,
      session: mockSession,
      deps: mockDeps,
    });

    expect(mockDeps.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1' }));
    expect(mockDeps.queuePolicyAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 't1',
        userId: 'u1',
        fileUrl: 'mock/path',
        fileName: 'policy.jpg',
        mimeType: 'image/jpeg',
        fileSize: 1000,
      })
    );
    expect(mockDeps.emitRequestedRun).toHaveBeenCalledWith({
      runId: 'run-1',
      tenantId: 't1',
      policyId: 'policy-1',
      userId: 'u1',
    });
    expect(result).toEqual({
      ok: true,
      data: {
        success: true,
        policyId: 'policy-1',
        runId: 'run-1',
        status: 'queued',
      },
    });
  });
});
