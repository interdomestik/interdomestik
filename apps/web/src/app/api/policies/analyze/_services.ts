import { db } from '@/lib/db.server';
import { createAdminClient } from '@interdomestik/database';
import { policies } from '@interdomestik/database/schema';
import { nanoid } from 'nanoid';

const POLICIES_BUCKET = process.env.NEXT_PUBLIC_SUPABASE_POLICY_BUCKET || 'policies';

/**
 * Service: Upload policy file to Supabase Storage
 */
export async function uploadPolicyFileService(args: {
  userId: string;
  tenantId: string;
  file: File;
  buffer: Buffer;
  safeName: string;
}) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ok: false as const,
      error: 'Supabase service role key is required for policy uploads.',
    };
  }

  const filePath = `pii/tenants/${args.tenantId}/policies/${args.userId}/${Date.now()}_${args.safeName}`;
  const adminClient = createAdminClient();
  const { error } = await adminClient.storage.from(POLICIES_BUCKET).upload(filePath, args.buffer, {
    contentType: args.file.type || 'application/octet-stream',
    upsert: false,
  });

  if (error) {
    console.error('Supabase policy upload error:', error);
    return { ok: false as const, error: 'Failed to upload policy file' };
  }

  return { ok: true as const, filePath };
}

/**
 * Service: Parse text from PDF buffer
 */
export async function analyzePdfService(buffer: Buffer): Promise<string> {
  try {
    const pdfModule = await import('pdf-parse');
    const pdf = pdfModule.default ?? pdfModule;
    const pdfData = await pdf(buffer);
    return pdfData.text;
  } catch (pdfError: unknown) {
    console.error('PDF Parse Error:', pdfError);
    return '';
  }
}

/**
 * Service: Save policy record to database
 */
export async function savePolicyService(data: any) {
  const [inserted] = await db
    .insert(policies)
    .values({
      id: nanoid(),
      ...data,
    })
    .returning();
  return inserted;
}
