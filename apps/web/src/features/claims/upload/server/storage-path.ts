import { resolveEvidenceBucketName } from '@/lib/storage/evidence-bucket';

export type EvidenceStoragePathShape = 'initial' | 'assigned';

export const EVIDENCE_PATH_SEGMENTS = {
  initial: 7,
  assigned: 6,
} as const;

const STORAGE_PREFIX = ['pii', 'tenants'] as const;
const CLAIMS_SEGMENT = 'claims';
const UNASSIGNED_SEGMENT = 'unassigned';
const SAFE_PATH_SEGMENT_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const SAFE_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]{1,160}$/;
const SAFE_EXTENSION_PATTERN = /^[a-z0-9]{1,16}$/;

type InitialPathParams = {
  actorId: string;
  bucket: string;
  expectedBucket?: string;
  fileId: string;
  fileName: string;
  shape: 'initial';
  tenantId: string;
};

type AssignedPathParams = {
  bucket: string;
  claimId: string;
  expectedBucket?: string;
  fileId: string;
  fileName: string;
  shape: 'assigned';
  tenantId: string;
};

type BuildEvidenceStoragePathParams = InitialPathParams | AssignedPathParams;

type InitialAssertParams = {
  actorId: string;
  bucket: string;
  expectedBucket?: string;
  fileId: string;
  shape: 'initial';
  storagePath: string;
  tenantId: string;
};

type AssignedAssertParams = {
  bucket: string;
  claimId: string;
  expectedBucket?: string;
  fileId: string;
  shape: 'assigned';
  storagePath: string;
  tenantId: string;
};

type AssertEvidenceStoragePathParams = InitialAssertParams | AssignedAssertParams;

function invariant(message: string): never {
  throw new Error(`Invalid evidence storage path: ${message}`);
}

function assertSafeSegment(label: string, value: string): string {
  if (typeof value !== 'string') invariant(`${label} must be a string`);
  const trimmedValue = value.trim();
  if (!trimmedValue || trimmedValue !== value) invariant(`${label} must not be empty or padded`);
  if (value === '.' || value === '..' || value.includes('..')) {
    invariant(`${label} must not contain dot traversal`);
  }
  if (value.includes('/') || value.includes('\\')) invariant(`${label} must not contain slashes`);
  if (!SAFE_PATH_SEGMENT_PATTERN.test(value)) invariant(`${label} contains unsupported characters`);
  return value;
}

function assertEvidenceBucket(bucket: string, expectedBucket?: string): void {
  const resolvedExpectedBucket = expectedBucket ?? resolveEvidenceBucketName();

  if (!bucket || bucket !== resolvedExpectedBucket) {
    invariant('bucket does not match the evidence bucket');
  }
}

function assertSafeFileNameInput(fileName: string): string {
  const trimmed = fileName.trim();

  if (!trimmed) invariant('fileName must not be empty');
  if (trimmed.includes('/') || trimmed.includes('\\'))
    invariant('fileName must not contain slashes');
  if (trimmed === '.' || trimmed === '..' || trimmed.includes('..')) {
    invariant('fileName must not contain dot traversal');
  }

  const lastDotIndex = trimmed.lastIndexOf('.');
  const basename = lastDotIndex > 0 ? trimmed.slice(0, lastDotIndex) : trimmed;
  if (!basename || /^\.+$/.test(basename)) invariant('fileName basename must not be pure dots');

  return trimmed;
}

function trimBoundaryUnderscores(value: string): string {
  let start = 0;
  let end = value.length;

  while (start < end && value[start] === '_') start += 1;
  while (end > start && value[end - 1] === '_') end -= 1;

  return value.slice(start, end);
}

function sanitizeInitialFileName(fileName: string): string {
  const trimmed = assertSafeFileNameInput(fileName);
  const lastDotIndex = trimmed.lastIndexOf('.');
  const hasRealExtension = lastDotIndex > 0 && lastDotIndex < trimmed.length - 1;
  const rawBasename = hasRealExtension ? trimmed.slice(0, lastDotIndex) : trimmed;
  const rawExtension = hasRealExtension ? trimmed.slice(lastDotIndex + 1) : '';
  const safeBasename = rawBasename
    .normalize('NFKD')
    .replaceAll(/[^\w.-]+/g, '_')
    .slice(0, 160);
  const trimmedSafeBasename = trimBoundaryUnderscores(safeBasename);
  const safeExtension = rawExtension
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, '')
    .slice(0, 16);
  const normalizedBasename =
    trimmedSafeBasename &&
    /^[A-Za-z0-9]/.test(trimmedSafeBasename) &&
    !/^\.+$/.test(trimmedSafeBasename)
      ? trimmedSafeBasename
      : 'file';
  const safeName = hasRealExtension
    ? `${normalizedBasename}.${safeExtension || 'bin'}`
    : normalizedBasename;

  if (!safeName || /^\.+$/.test(safeName) || safeName.includes('..')) {
    invariant('fileName did not produce a safe storage name');
  }
  if (safeName.includes('/') || safeName.includes('\\')) {
    invariant('fileName produced an unsafe storage name');
  }
  if (!SAFE_FILE_NAME_PATTERN.test(safeName)) {
    invariant('fileName produced unsupported storage characters');
  }

  return safeName;
}

function sanitizeAssignedExtension(fileName: string): string {
  const trimmed = assertSafeFileNameInput(fileName);
  const lastDotIndex = trimmed.lastIndexOf('.');
  const rawExtension =
    lastDotIndex > 0 && lastDotIndex < trimmed.length - 1 ? trimmed.slice(lastDotIndex + 1) : '';
  const safeExtension = rawExtension
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/g, '')
    .slice(0, 16);

  return safeExtension || 'bin';
}

function assertSafeGeneratedFileName(fileName: string): void {
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) {
    invariant('stored file name segment is unsafe');
  }
  if (/^\.+$/.test(fileName) || !SAFE_FILE_NAME_PATTERN.test(fileName)) {
    invariant('stored file name segment is unsupported');
  }
}

export function buildEvidenceStoragePath(params: BuildEvidenceStoragePathParams): string {
  assertEvidenceBucket(params.bucket, params.expectedBucket);
  const tenantId = assertSafeSegment('tenantId', params.tenantId);
  const fileId = assertSafeSegment('fileId', params.fileId);

  if (params.shape === 'initial') {
    const actorId = assertSafeSegment('actorId', params.actorId);
    const safeName = sanitizeInitialFileName(params.fileName);
    return `${STORAGE_PREFIX[0]}/${STORAGE_PREFIX[1]}/${tenantId}/${CLAIMS_SEGMENT}/${actorId}/${UNASSIGNED_SEGMENT}/${fileId}-${safeName}`;
  }

  const claimId = assertSafeSegment('claimId', params.claimId);
  const extension = sanitizeAssignedExtension(params.fileName);
  return `${STORAGE_PREFIX[0]}/${STORAGE_PREFIX[1]}/${tenantId}/${CLAIMS_SEGMENT}/${claimId}/${fileId}.${extension}`;
}

export function assertEvidenceStoragePath(params: AssertEvidenceStoragePathParams): void {
  assertEvidenceBucket(params.bucket, params.expectedBucket);
  const tenantId = assertSafeSegment('tenantId', params.tenantId);
  const fileId = assertSafeSegment('fileId', params.fileId);
  const segments = params.storagePath.split('/');

  if (segments.some(segment => !segment)) invariant('path contains empty segments');
  if (segments.length !== EVIDENCE_PATH_SEGMENTS[params.shape]) {
    invariant(`${params.shape} path has the wrong segment count`);
  }
  if (
    segments[0] !== STORAGE_PREFIX[0] ||
    segments[1] !== STORAGE_PREFIX[1] ||
    segments[2] !== tenantId ||
    segments[3] !== CLAIMS_SEGMENT
  ) {
    invariant('path prefix does not match tenant evidence storage');
  }

  if (params.shape === 'initial') {
    const actorId = assertSafeSegment('actorId', params.actorId);
    if (segments[4] !== actorId || segments[5] !== UNASSIGNED_SEGMENT) {
      invariant('initial upload path owner or shape does not match');
    }

    const fileName = segments[6];
    const expectedFilePrefix = `${fileId}-`;
    if (!fileName.startsWith(expectedFilePrefix)) invariant('initial upload file id mismatch');
    assertSafeGeneratedFileName(fileName.slice(expectedFilePrefix.length));
    return;
  }

  const claimId = assertSafeSegment('claimId', params.claimId);
  if (segments[4] !== claimId) invariant('assigned upload claim id mismatch');

  const fileName = segments[5];
  const expectedFilePrefix = `${fileId}.`;
  if (!fileName.startsWith(expectedFilePrefix)) invariant('assigned upload file id mismatch');

  const extension = fileName.slice(expectedFilePrefix.length);
  if (!SAFE_EXTENSION_PATTERN.test(extension)) invariant('assigned upload extension is unsafe');
}
