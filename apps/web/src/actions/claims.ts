'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { claims } from '@interdomestik/database/schema';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';
import { z } from 'zod';

const claimSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().optional(),
  category: z.string().min(1, 'Please select a category'),
  companyName: z.string().min(1, 'Company name is required'),
  claimAmount: z
    .string()
    .optional()
    .transform(val => (val ? val : null)), // Handle empty string for optional decimal
  currency: z.string().default('EUR'),
});

export async function createClaim(prevState: unknown, formData: FormData) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return { error: 'Unauthorized' };
  }

  const result = claimSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    // Flatten Zod errors for easier client-side handling
    const errors = result.error.flatten().fieldErrors;
    // Map array of strings to single string (taking the first error message)
    const formattedErrors: Record<string, string> = {};

    // Explicitly iterate over known keys or cast key
    Object.keys(errors).forEach(key => {
      const fieldKey = key as keyof typeof errors;
      const messages = errors[fieldKey];
      if (messages && messages.length > 0) {
        formattedErrors[key] = messages[0];
      }
    });

    return { error: 'Validation failed', issues: formattedErrors };
  }

  const { title, description, category, companyName, claimAmount, currency } = result.data;

  try {
    await db.insert(claims).values({
      id: nanoid(),
      userId: session.user.id,
      title,
      description,
      category,
      companyName,
      claimAmount: claimAmount || undefined, // Drizzle handles decimal strings
      currency,
      status: 'draft',
    });
  } catch (error) {
    console.error('Failed to create claim:', error);
    return { error: 'Failed to create claim. Please try again.' };
  }

  // We return success and let the client handle the redirect to /dashboard/claims
  // this is often smoother for UX than server-side redirect in an action which can be abrupt.
  return { success: true };
}

// Simplified action for the wizard component with typed data
export async function submitClaimAction(data: {
  title: string;
  description: string;
  category: string;
  companyName: string;
  claimAmount?: string;
  currency?: string;
}) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    throw new Error('Unauthorized');
  }

  const result = claimSchema.safeParse(data);

  if (!result.success) {
    throw new Error('Validation failed');
  }

  const { title, description, category, companyName, claimAmount, currency } = result.data;

  try {
    await db.insert(claims).values({
      id: nanoid(),
      userId: session.user.id,
      title,
      description,
      category,
      companyName,
      claimAmount: claimAmount || undefined,
      currency: currency || 'EUR',
      status: 'draft',
    });
  } catch (error) {
    console.error('Failed to create claim:', error);
    throw new Error('Failed to create claim. Please try again.');
  }

  return { success: true };
}

import { eq } from 'drizzle-orm'; // Need to import eq
import { revalidatePath } from 'next/cache';

export async function updateClaimStatus(claimId: string, newStatus: string) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session || session.user.role !== 'admin') {
    return { error: 'Unauthorized' };
  }

  // Validate status against enum
  const validStatuses = ['draft', 'submitted', 'processing', 'resolved', 'rejected'];
  if (!validStatuses.includes(newStatus)) {
    return { error: 'Invalid status' };
  }

  try {
    await db
      .update(claims)
      .set({
        // @ts-expect-error - enum type mismatch with string, guarded by runtime check
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(claims.id, claimId));

    revalidatePath('/admin/claims');
    revalidatePath(`/admin/claims/${claimId}`);
    revalidatePath('/dashboard/claims'); // Update user view too

    return { success: true };
  } catch (e) {
    console.error('Failed to update status:', e);
    return { error: 'Failed to update status' };
  }
}
