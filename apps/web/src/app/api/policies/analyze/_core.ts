import { ApiResult } from '@/core-contracts';

// Dependencies needed by the core
export interface AnalyzePolicyDeps {
  uploadFile: (args: {
    userId: string;
    tenantId: string;
    file: File;
    buffer: Buffer;
    safeName: string;
  }) => Promise<{ ok: true; filePath: string } | { ok: false; error: string }>;
  queuePolicyAnalysis: (args: {
    tenantId: string;
    userId: string;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    fileSize: number;
  }) => Promise<{ policyId: string; runId: string }>;
  emitRequestedRun: (args: {
    runId: string;
    tenantId: string;
    policyId: string;
    userId: string;
  }) => Promise<void>;
  markRunDispatchFailed: (args: { runId: string; message: string }) => Promise<void>;
}

export interface AnalyzePolicyParams {
  file: File;
  buffer: Buffer; // Passed explicitly to avoid async arrayBuffer() in core
  session: { userId: string; tenantId: string };
  deps: AnalyzePolicyDeps;
}

type AnalyzePolicyQueuedResult = {
  success: true;
  policyId: string;
  runId: string;
  status: 'queued';
};

const MAX_UPLOAD_BYTES =
  Number.parseInt(process.env.POLICY_UPLOAD_MAX_BYTES || '', 10) || 15_000_000;
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

function isValidUpload(file: File) {
  if (ALLOWED_MIME_TYPES.has(file.type)) return true;
  const lower = file.name.toLowerCase();
  return (
    lower.endsWith('.pdf') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.webp')
  );
}

function sanitizeFileName(name: string) {
  return name.replaceAll(/[^\w.-]+/g, '_');
}

function buildInternalErrorMessage(error: unknown) {
  const prefix = 'Internal error while analyzing policy';
  if (error instanceof Error && error.message) {
    return `${prefix}: ${error.message}`;
  }

  return prefix;
}

export async function analyzePolicyCore(
  params: AnalyzePolicyParams
): Promise<ApiResult<AnalyzePolicyQueuedResult>> {
  const { file, buffer, session, deps } = params;

  // 1. Validation
  if (!file) {
    return { ok: false, code: 'BAD_REQUEST', message: 'No file provided' };
  }

  if (!isValidUpload(file)) {
    return {
      ok: false,
      code: 'BAD_REQUEST',
      message: 'Only PDF and image uploads are supported (PDF, JPEG, PNG, WebP)',
    };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, code: 'PAYLOAD_TOO_LARGE', message: 'File too large' };
  }

  const safeName = sanitizeFileName(file.name);

  try {
    const uploadResult = await deps.uploadFile({
      userId: session.userId,
      tenantId: session.tenantId,
      file,
      buffer,
      safeName,
    });

    if (!uploadResult.ok) {
      return { ok: false, code: 'INTERNAL_ERROR', message: uploadResult.error };
    }

    const queuedAnalysis = await deps.queuePolicyAnalysis({
      tenantId: session.tenantId,
      userId: session.userId,
      fileUrl: uploadResult.filePath,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      fileSize: file.size,
    });

    try {
      await deps.emitRequestedRun({
        runId: queuedAnalysis.runId,
        tenantId: session.tenantId,
        policyId: queuedAnalysis.policyId,
        userId: session.userId,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error && error.message ? error.message : 'Event dispatch failed';

      try {
        await deps.markRunDispatchFailed({
          runId: queuedAnalysis.runId,
          message,
        });
      } catch (dispatchFailureError) {
        console.error(
          'Failed to mark queued policy analysis run as failed after dispatch error:',
          dispatchFailureError
        );
      }

      return {
        ok: false,
        code: 'INTERNAL_ERROR',
        message: `Failed to queue policy analysis: ${message}`,
      };
    }

    return {
      ok: true,
      data: {
        success: true,
        policyId: queuedAnalysis.policyId,
        runId: queuedAnalysis.runId,
        status: 'queued',
      },
    };
  } catch (error: unknown) {
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      message: buildInternalErrorMessage(error),
      error,
    };
  }
}
