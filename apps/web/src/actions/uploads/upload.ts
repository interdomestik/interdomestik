'use server';

import { memberGuarded } from '@/lib/privacy/require-member-acceptance';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import {
  validateEvidenceFile,
  evidenceSignatureMatches,
  EVIDENCE_PREFIX_BYTES,
} from '@/features/claims/upload/evidence-file-policy';
import { uploadToStorage } from './voice-note-storage';
import { MAX_VOICE_NOTE_ACTION_BYTES } from './voice-note-policy';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { headers } from 'next/headers';

export type UploadResult =
  | {
      success: true;
      url: string;
      path: string;
      id: string;
      bucket: string;
      intentToken: string;
      mimeType: string;
      size: number;
    }
  | { success: false; error: string };

export const uploadVoiceNote = memberGuarded(
  async ({ session }, formData: FormData): Promise<UploadResult> => {
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return { success: false, error: 'No file provided' };
    }

    // 2. Early Size Check
    if (file.size > MAX_VOICE_NOTE_ACTION_BYTES) {
      return { success: false, error: 'evidence_too_large' };
    }

    // 3. Rate Limit
    const rateLimit = await enforceRateLimitForAction({
      name: 'action:upload-voice',
      limit: 5,
      windowSeconds: 600,
      headers: await headers(),
      productionSensitive: true,
    });

    if (rateLimit.limited) {
      if (rateLimit.status === 503) {
        return { success: false, error: 'Service unavailable. Please try again later.' };
      }
      return { success: false, error: 'Too many uploads. Please try again later.' };
    }

    const validation = validateEvidenceFile(file.name, file.size, file.type);
    if (!validation.success) return { success: false, error: validation.error };
    if (validation.format.category !== 'audio')
      return { success: false, error: 'evidence_unsupported' };
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);
    if (
      buffer.byteLength !== file.size ||
      !evidenceSignatureMatches(validation.format, buffer.subarray(0, EVIDENCE_PREFIX_BYTES))
    ) {
      return { success: false, error: 'evidence_content_mismatch' };
    }
    return uploadToStorage({
      buffer: Buffer.from(arrayBuffer),
      ext: validation.format.extensions[0],
      contentType: validation.format.mimeType,
      userId: session.user.id,
      tenantId: ensureTenantId(session),
    });
  }
);
