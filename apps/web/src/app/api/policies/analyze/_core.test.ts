import { describe, expect, it, vi } from 'vitest';
import { analyzePolicyCore, AnalyzePolicyDeps } from './_core';

const mockDeps: AnalyzePolicyDeps = {
  uploadFile: vi.fn().mockResolvedValue({ ok: true, filePath: 'mock/path' }),
  analyzeImage: vi.fn(),
  analyzePdf: vi.fn(),
  analyzeText: vi.fn(),
  savePolicy: vi.fn().mockImplementation(data => Promise.resolve({ ...data, id: 'p1' })),
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

  it('handles image flow correctly', async () => {
    vi.mocked(mockDeps.analyzeImage).mockResolvedValueOnce({ provider: 'mock-ai' });

    const result = await analyzePolicyCore({
      file: mockFile('policy.jpg', 'image/jpeg'),
      buffer: mockBuffer,
      session: mockSession,
      deps: mockDeps,
    });

    expect(mockDeps.analyzeImage).toHaveBeenCalled();
    expect(mockDeps.uploadFile).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 't1' }));
    expect(mockDeps.savePolicy).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('handles PDF flow correctly', async () => {
    vi.mocked(mockDeps.analyzePdf).mockResolvedValueOnce(
      'Valid text content from PDF that is definitely longer than fifty characters to pass the validation check required by the core business logic.'
    );
    vi.mocked(mockDeps.analyzeText).mockResolvedValueOnce({ provider: 'mock-text-ai' });

    const result = await analyzePolicyCore({
      file: mockFile('policy.pdf', 'application/pdf'),
      buffer: mockBuffer,
      session: mockSession,
      deps: mockDeps,
    });

    expect(mockDeps.analyzePdf).toHaveBeenCalled();
    expect(mockDeps.analyzeText).toHaveBeenCalled();
    expect(mockDeps.savePolicy).toHaveBeenCalled();
    expect(result.ok).toBe(true);
  });

  it('returns UNPROCESSABLE_ENTITY for scanned (empty text) PDFs', async () => {
    vi.mocked(mockDeps.analyzePdf).mockResolvedValueOnce(''); // Empty text

    const result = await analyzePolicyCore({
      file: mockFile('scanned.pdf', 'application/pdf'),
      buffer: mockBuffer,
      session: mockSession,
      deps: mockDeps,
    });

    expect(result).toEqual({
      ok: false,
      code: 'UNPROCESSABLE_ENTITY',
      message: expect.stringContaining('Scanned PDFs'),
    });
  });
});
