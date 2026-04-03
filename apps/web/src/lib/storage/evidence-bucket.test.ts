import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_EVIDENCE_BUCKET, resolveEvidenceBucketName } from './evidence-bucket';

describe('resolveEvidenceBucketName', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back to the default evidence bucket when production env leaves it unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET', '');

    expect(resolveEvidenceBucketName()).toBe(DEFAULT_EVIDENCE_BUCKET);
  });

  it('returns the configured evidence bucket when it is valid', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET', 'custom-evidence-bucket');

    expect(resolveEvidenceBucketName()).toBe('custom-evidence-bucket');
  });

  it('throws when the configured evidence bucket is invalid', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET', 'Invalid Bucket Name');

    expect(() => resolveEvidenceBucketName()).toThrow(
      'NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET must be a valid Supabase bucket name'
    );
  });
});
