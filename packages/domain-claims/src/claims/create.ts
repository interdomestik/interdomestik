import { claims, db } from '@interdomestik/database';
import { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import type { ClaimsDeps, ClaimsSession } from './types';

const claimSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().optional(),
  category: z.string().min(1, 'Please select a category'),
  companyName: z.string().min(1, 'Company name is required'),
  claimAmount: z
    .string()
    .optional()
    .transform((val: string | undefined) => (val ? val : null)), // Handle empty string for optional decimal
  currency: z.string().default('EUR'),
});

function formatZodFieldErrors(errors: Record<string, string[] | undefined>) {
  const formattedErrors: Record<string, string> = {};

  Object.keys(errors).forEach(key => {
    const messages = errors[key];
    if (messages && messages.length > 0) {
      formattedErrors[key] = messages[0];
    }
  });

  return formattedErrors;
}

export async function createClaimCore(
  params: {
    session: ClaimsSession | null;
    requestHeaders: Headers;
    formData: FormData;
  },
  deps: ClaimsDeps = {}
) {
  const { session, requestHeaders, formData } = params;

  if (!session) {
    return { error: 'Unauthorized' };
  }

  const tenantId = ensureTenantId(session);
  const subscription = await getActiveSubscription(session.user.id, tenantId);
  if (!subscription) {
    return { error: 'Membership required to create a claim.' };
  }

  const result = claimSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const formattedErrors = formatZodFieldErrors(errors as unknown as Record<string, string[]>);

    return { error: 'Validation failed', issues: formattedErrors };
  }

  const { title, description, category, companyName, claimAmount, currency } = result.data;

  const claimId = nanoid();

  try {
    await db.insert(claims).values({
      id: claimId,
      tenantId,
      userId: session.user.id,
      title,
      description,
      category,
      companyName,
      claimAmount: claimAmount || undefined,
      currency,
      status: 'draft',
      branchId: subscription.branchId,
      agentId: subscription.agentId,
    });

    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        action: 'claim.created',
        entityType: 'claim',
        entityId: claimId,
        metadata: {
          status: 'draft',
          category,
          companyName,
          claimAmount: claimAmount || null,
        },
        headers: requestHeaders,
      });
    }
  } catch (error) {
    console.error('Failed to create claim:', error);
    return { error: 'Failed to create claim. Please try again.' };
  }

  return { success: true };
}
