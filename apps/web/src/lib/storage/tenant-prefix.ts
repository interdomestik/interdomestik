import { DEFAULT_EVIDENCE_BUCKET, resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';

export const CLAIM_EVIDENCE_BUCKET = DEFAULT_EVIDENCE_BUCKET;
export const POLICIES_BUCKET = 'policies';

const BUCKET_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,62}$/;

export type TenantStorageFamily = 'claims' | 'policies';

export type TenantStorageAssertion = {
  bucket: string;
  context?: string;
  family: TenantStorageFamily;
  path: string;
  tenantId: string;
};

export class TenantStoragePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantStoragePathError';
  }
}

function normalizeBucket(bucket: string): string {
  return bucket.trim();
}

function splitTenantStoragePath(path: string): string[] {
  if (path.includes('\\')) {
    throw new TenantStoragePathError('Storage path must not contain backslashes.');
  }

  const segments = path.split('/');
  if (segments.some(segment => segment.length === 0)) {
    throw new TenantStoragePathError('Storage path must not contain empty segments.');
  }

  if (segments.some(segment => segment === '.' || segment === '..' || segment.includes('..'))) {
    throw new TenantStoragePathError('Storage path must not contain traversal segments.');
  }

  return segments;
}

export function resolvePolicyBucketName(env: NodeJS.ProcessEnv = process.env): string {
  const configuredBucket = env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET?.trim();

  if (!configuredBucket) {
    return POLICIES_BUCKET;
  }

  if (!BUCKET_NAME_PATTERN.test(configuredBucket)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_POLICY_BUCKET must be a valid Supabase bucket name');
  }

  return configuredBucket;
}

function expectedBucketForFamily(family: TenantStorageFamily): string {
  return family === 'policies' ? resolvePolicyBucketName() : resolveEvidenceBucketName();
}

export function assertTenantStoragePath(args: TenantStorageAssertion): void {
  const bucket = normalizeBucket(args.bucket);
  const expectedBucket = expectedBucketForFamily(args.family);

  if (bucket !== expectedBucket) {
    throw new TenantStoragePathError(
      `${args.context ?? 'storage'} bucket mismatch: expected ${expectedBucket}.`
    );
  }

  const tenantId = args.tenantId.trim();
  if (!tenantId) {
    throw new TenantStoragePathError(`${args.context ?? 'storage'} tenant id is required.`);
  }

  const segments = splitTenantStoragePath(args.path);
  const expectedPrefix = ['pii', 'tenants', tenantId, args.family];
  const prefixMatches = expectedPrefix.every((segment, index) => segments[index] === segment);

  if (!prefixMatches || segments.length <= expectedPrefix.length) {
    throw new TenantStoragePathError(
      `${args.context ?? 'storage'} path must start with ${expectedPrefix.join('/')}/.`
    );
  }
}

export function assertClaimEvidenceStoragePath(args: {
  bucket: string;
  context?: string;
  path: string;
  tenantId: string;
}): void {
  assertTenantStoragePath({ ...args, family: 'claims' });
}

export function assertPolicyStoragePath(args: {
  bucket: string;
  context?: string;
  path: string;
  tenantId: string;
}): void {
  assertTenantStoragePath({ ...args, family: 'policies' });
}

export function buildPolicyStoragePath(args: {
  bucket?: string;
  fileName: string;
  tenantId: string;
  userId: string;
}): string {
  const safeName = args.fileName.trim();
  if (!safeName || safeName.includes('/') || safeName.includes('\\')) {
    throw new TenantStoragePathError('Policy storage file name is invalid.');
  }

  const path = ['pii', 'tenants', args.tenantId, 'policies', args.userId, safeName].join('/');
  assertPolicyStoragePath({
    bucket: args.bucket ?? resolvePolicyBucketName(),
    context: 'policy upload',
    path,
    tenantId: args.tenantId,
  });
  return path;
}

export function splitStorageFolderAndName(path: string): { fileName: string; folder: string } {
  const segments = splitTenantStoragePath(path);
  if (segments.length < 2) {
    throw new TenantStoragePathError('Storage path must include a folder and file name.');
  }

  return {
    fileName: segments[segments.length - 1],
    folder: segments.slice(0, -1).join('/'),
  };
}
