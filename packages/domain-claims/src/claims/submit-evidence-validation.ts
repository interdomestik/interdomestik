import type { CreateClaimValues } from '../validators/claims';
import type { ClaimsSession, ClaimsDeps } from './types';
import { ClaimValidationError } from './claim-validation-error';
import { validateEvidenceFile } from './evidence-file-policy';

export async function validateClaimFiles(
  files: CreateClaimValues['files'],
  session: ClaimsSession,
  tenantId: string,
  deps: ClaimsDeps
): Promise<void> {
  if (!files?.length) return;

  const context = getClaimFileValidationContext(session, tenantId);
  const validateSubmittedClaimFile = requireSubmittedClaimFileValidator(deps);

  files.forEach(file => validateClaimFileMetadata(file, context));
  await Promise.all(
    files.map(file => validateClaimFileObject(file, context, validateSubmittedClaimFile))
  );
}

type ClaimEvidenceFile = NonNullable<CreateClaimValues['files']>[number];
type SubmittedClaimFileValidator = NonNullable<ClaimsDeps['validateSubmittedClaimFile']>;

type ClaimFileValidationContext = {
  actorId: string;
  expectedBucket: string;
  expectedPrefix: string;
  tenantId: string;
};

function getClaimFileValidationContext(
  session: ClaimsSession,
  tenantId: string
): ClaimFileValidationContext {
  return {
    actorId: session.user.id,
    expectedBucket: process.env.NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET || 'claim-evidence',
    expectedPrefix: `pii/tenants/${tenantId}/claims/${session.user.id}/`,
    tenantId,
  };
}

function requireSubmittedClaimFileValidator(deps: ClaimsDeps): SubmittedClaimFileValidator {
  if (!deps.validateSubmittedClaimFile) {
    throw new Error('Submitted claim file validation is not configured.');
  }

  return deps.validateSubmittedClaimFile;
}

function validateClaimFileMetadata(
  file: ClaimEvidenceFile,
  context: ClaimFileValidationContext
): void {
  if (file.bucket !== context.expectedBucket) {
    throw new ClaimValidationError(
      'Invalid file bucket. Evidence must be stored in the designated claim evidence bucket.',
      'INVALID_BUCKET'
    );
  }
  if (!file.path.startsWith(context.expectedPrefix)) {
    throw new ClaimValidationError(
      'Invalid file path detected. Evidence must be uploaded by the claimant.',
      'INVALID_PATH'
    );
  }
  const validation = validateEvidenceFile(file.name, file.size, file.type);
  if (!validation.success) {
    const code = validation.error === 'evidence_too_large' ? 'INVALID_SIZE' : 'INVALID_TYPE';
    throw new ClaimValidationError(validation.error, code);
  }
  if (validation.format.mimeType !== file.type) {
    throw new ClaimValidationError('evidence_unsupported', 'INVALID_TYPE');
  }
  if (!file.uploadIntentToken) {
    throw new ClaimValidationError(
      'Upload confirmation expired. Please retry upload.',
      'INVALID_PATH'
    );
  }
}

async function validateClaimFileObject(
  file: ClaimEvidenceFile,
  context: ClaimFileValidationContext,
  validateSubmittedClaimFile: SubmittedClaimFileValidator
): Promise<void> {
  try {
    await validateSubmittedClaimFile({
      actorId: context.actorId,
      file,
      tenantId: context.tenantId,
    });
  } catch (error) {
    if (error instanceof ClaimValidationError) {
      throw error;
    }

    throw new ClaimValidationError(
      error instanceof Error ? error.message : 'Uploaded file could not be verified.',
      'INVALID_PATH'
    );
  }
}
