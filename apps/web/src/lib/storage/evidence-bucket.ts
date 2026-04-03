export const DEFAULT_EVIDENCE_BUCKET = 'claim-evidence';
const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}$/;

export function resolveEvidenceBucketName(env: NodeJS.ProcessEnv = process.env): string {
  const configuredBucket = env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET?.trim();

  if (!configuredBucket) {
    return DEFAULT_EVIDENCE_BUCKET;
  }

  if (!BUCKET_NAME_PATTERN.test(configuredBucket)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET must be a valid Supabase bucket name');
  }

  return configuredBucket;
}
