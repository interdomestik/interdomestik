import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveEvidenceBucketName } from './evidence-bucket';

describe('resolveEvidenceBucketName', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('falls back to the default evidence bucket when production env leaves it unset', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET', '');

    expect(resolveEvidenceBucketName()).toBe('claim-evidence');
  });
});
