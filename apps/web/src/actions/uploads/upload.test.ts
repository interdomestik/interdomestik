import { beforeEach, describe, expect, it, vi } from 'vitest';
import { uploadVoiceNote } from './upload';

const hoisted = vi.hoisted(() => ({
  getSession: vi.fn(),
  rateLimit: vi.fn(),
  upload: vi.fn(),
  createSignedUrl: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: hoisted.getSession,
    },
  },
}));

vi.mock('@/lib/rate-limit', () => ({
  enforceRateLimitForAction: hoisted.rateLimit,
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    storage: {
      from: () => ({
        upload: hoisted.upload,
        createSignedUrl: hoisted.createSignedUrl,
      }),
    },
  }),
}));

vi.mock('next/headers', () => ({
  headers: () => new Headers(),
}));

describe('uploadVoiceNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.getSession.mockResolvedValue({
      user: { id: 'user-1', tenantId: 'tenant_mk' },
    });
    hoisted.rateLimit.mockResolvedValue({ limited: false });
    hoisted.upload.mockResolvedValue({ error: null });
    hoisted.createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://signed.example.com/file' },
      error: null,
    });

    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  it('prevents Stored XSS by overriding malicious content-type', async () => {
    // Valid MP3 magic bytes (ID3)
    const bytes = new Uint8Array([0x49, 0x44, 0x33, 0x00]);
    const file = {
      name: 'exploit.mp3',
      type: 'text/html', // <--- Malicious Type (Attacker controlled)
      size: bytes.length,
      arrayBuffer: async () => bytes.buffer,
    } as File;
    const formData = {
      get: (key: string) => (key === 'file' ? file : null),
    } as FormData;

    const result = await uploadVoiceNote(formData);

    expect(result.success).toBe(true);
    // Verify that the upload function ignored 'text/html' and forced 'audio/mpeg'
    expect(hoisted.upload).toHaveBeenCalledWith(
      expect.stringContaining('.mp3'),
      expect.anything(),
      expect.objectContaining({
        contentType: 'audio/mpeg', // <--- Safely derived from extension/magic bytes
        upsert: false,
      })
    );
  });

  it('infers mp4 extension when content-type is missing', async () => {
    const bytes = new Uint8Array(12);
    // ftyp at offset 4
    bytes[4] = 0x66;
    bytes[5] = 0x74;
    bytes[6] = 0x79;
    bytes[7] = 0x70;

    const file = {
      name: 'blob',
      type: '',
      size: bytes.length,
      arrayBuffer: async () => bytes.buffer,
    } as File;
    const formData = {
      get: (key: string) => (key === 'file' ? file : null),
    } as FormData;

    const result = await uploadVoiceNote(formData);

    expect(result).toEqual(
      expect.objectContaining({ success: true, path: expect.stringContaining('.mp4') })
    );
    expect(hoisted.upload).toHaveBeenCalled();
  });

  it('returns service unavailable when rate limiting is offline', async () => {
    hoisted.rateLimit.mockResolvedValue({
      limited: true,
      status: 503,
      error: 'Service unavailable',
    });

    const bytes = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3]);
    const file = {
      name: 'voice.webm',
      type: 'audio/webm',
      size: bytes.length,
      arrayBuffer: async () => bytes.buffer,
    } as File;
    const formData = {
      get: (key: string) => (key === 'file' ? file : null),
    } as FormData;

    const result = await uploadVoiceNote(formData);

    expect(result).toEqual({
      success: false,
      error: 'Service unavailable. Please try again later.',
    });
    expect(hoisted.upload).not.toHaveBeenCalled();
  });
});
