import { webmFixture } from '../../../../../packages/domain-claims/src/test/evidence-container-fixtures';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_VOICE_NOTE_ACTION_BYTES } from './voice-note-policy';
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

vi.mock('@interdomestik/database', () => ({
  createAdminClient: () => ({
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
    vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', 'test-upload-intent-secret-value-123456');
    vi.stubEnv('S3_ENDPOINT', '');
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
    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        bucket: 'claim-evidence',
        id: expect.any(String),
        intentToken: expect.any(String),
        mimeType: 'audio/mpeg',
        size: bytes.length,
      })
    );
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

  it('validates m4a content when content-type is missing', async () => {
    const bytes = new Uint8Array(16);
    bytes[3] = 16;
    bytes.set([0x4d, 0x34, 0x41, 0x20], 8);
    // ftyp at offset 4
    bytes[4] = 0x66;
    bytes[5] = 0x74;
    bytes[6] = 0x79;
    bytes[7] = 0x70;

    const file = {
      name: 'voice.m4a',
      type: '',
      size: bytes.length,
      arrayBuffer: async () => bytes.buffer,
    } as File;
    const formData = {
      get: (key: string) => (key === 'file' ? file : null),
    } as FormData;

    const result = await uploadVoiceNote(formData);

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        path: expect.stringContaining('.m4a'),
        mimeType: 'audio/mp4',
      })
    );
    expect(hoisted.upload).toHaveBeenCalled();
  });

  it('stores voice notes on the initial claim upload intent path', async () => {
    const bytes = webmFixture();
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

    expect(result).toEqual(
      expect.objectContaining({
        success: true,
        bucket: 'claim-evidence',
        intentToken: expect.any(String),
        mimeType: 'audio/webm',
      })
    );
    expect(hoisted.upload).toHaveBeenCalledWith(
      expect.stringMatching(
        /^pii\/tenants\/tenant_mk\/claims\/user-1\/unassigned\/.+-voicenote\.webm$/
      ),
      expect.anything(),
      expect.objectContaining({
        contentType: 'audio/webm',
      })
    );
  });

  it('returns service unavailable when rate limiting is offline', async () => {
    hoisted.rateLimit.mockResolvedValue({
      limited: true,
      status: 503,
      error: 'Service unavailable',
    });

    const bytes = webmFixture();
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

  it.each([
    {
      name: 'voice.mp3',
      type: 'audio/mpeg',
      bytes: new Uint8Array([0, 1, 2]),
      size: 3,
      error: 'evidence_content_mismatch',
    },
    {
      name: 'voice.txt',
      type: 'audio/mpeg',
      bytes: new Uint8Array([0x49, 0x44, 0x33]),
      size: 3,
      error: 'evidence_unsupported',
    },
    {
      name: 'voice.mp3',
      type: 'audio/mpeg',
      bytes: new Uint8Array([0x49, 0x44, 0x33]),
      size: 2 * 1024 * 1024 + 1,
      error: 'evidence_too_large',
    },
  ])(
    'rejects invalid retained voice upload: $error',
    async ({ name, type, bytes, size, error }) => {
      hoisted.getSession.mockResolvedValue({ user: { id: 'user-1', tenantId: 'tenant_mk' } });
      hoisted.rateLimit.mockResolvedValue({ limited: false });
      const file = { name, type, size, arrayBuffer: () => Promise.resolve(bytes.buffer) } as File;
      expect(await uploadVoiceNote({ get: () => file } as unknown as FormData)).toEqual({
        success: false,
        error,
      });
    }
  );

  it('accepts the capped voice payload and rejects the next byte before storage', async () => {
    const bytes = new Uint8Array(MAX_VOICE_NOTE_ACTION_BYTES);
    bytes.set([0x49, 0x44, 0x33]);
    const file = {
      name: 'voice.mp3',
      type: 'audio/mpeg',
      size: bytes.length,
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    } as File;
    const result = await uploadVoiceNote({ get: () => file } as unknown as FormData);
    expect(result).toMatchObject({ success: true, mimeType: 'audio/mpeg' });
    expect(MAX_VOICE_NOTE_ACTION_BYTES).toBeLessThan(2 * 1024 * 1024);
    hoisted.upload.mockClear();
    const oversized = { ...file, size: MAX_VOICE_NOTE_ACTION_BYTES + 1 };
    expect(await uploadVoiceNote({ get: () => oversized } as unknown as FormData)).toEqual({
      success: false,
      error: 'evidence_too_large',
    });
    expect(hoisted.upload).not.toHaveBeenCalled();
  });
});
