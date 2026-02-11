const DEFAULT_EVIDENCE_BUCKET = 'claim-evidence';
const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}$/;

function isProductionEnvironment(env: NodeJS.ProcessEnv): boolean {
  if (typeof env.VERCEL_ENV === 'string' && env.VERCEL_ENV.length > 0) {
    return env.VERCEL_ENV === 'production';
  }
  return env.NODE_ENV === 'production';
}

export function resolveEvidenceBucketName(env: NodeJS.ProcessEnv = process.env): string {
  const configuredBucket = env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET?.trim();

  if (!configuredBucket) {
    if (isProductionEnvironment(env)) {
      throw new Error('Supabase evidence bucket is not configured');
    }
    return DEFAULT_EVIDENCE_BUCKET;
  }

  if (!BUCKET_NAME_PATTERN.test(configuredBucket)) {
    throw new Error('Supabase evidence bucket name is invalid');
  }

  return configuredBucket;
}
