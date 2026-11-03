import { claims } from '@interdomestik/database';
import { generateClaimNumber } from '@interdomestik/database/claim-number';
import { readTenantLocaleMetadata } from '@interdomestik/database/tenant-directory';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { getActiveSubscription } from '@interdomestik/domain-membership-billing/subscription';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { nanoid } from 'nanoid';
import { z } from 'zod';

import { formatZodFieldErrors, extractBranchIdFromSetting } from './create-helpers';
import { resolveClaimIncidentCountry } from './incident-country';
import { mapClaimStatusToLifecycleStates } from './lifecycle-state';
import { recordCaseCreatedEvent } from './case-created-event';
import type { ClaimsDeps, ClaimsSession } from './types';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

const claimSchema = z.object({
  title: z.string().min(3).max(100),
  description: z.string().optional(),
  category: z.string().min(1, 'Please select a category'),
  companyName: z.string().min(1, 'Company name is required'),
  claimAmount: z
    .string()
    .optional()
    .transform((val: string | undefined) => val || null),
  currency: z.string().default('EUR'),
  incidentCountryCode: z.string().optional(),
  incidentJurisdiction: z.string().optional(),
});

export async function createClaimCore(
  params: {
    authority: TenantAuthority | null;
    session: ClaimsSession | null;
    requestHeaders: Headers;
    hostId?: string | null;
    formData: FormData;
  },
  deps: ClaimsDeps = {}
) {
  const { authority, session, requestHeaders, formData } = params;

  if (!session || !authority) {
    return { success: false, error: 'Unauthorized' };
  }

  ensureTenantId(session);
  const { tenantId } = readTenantAuthority(authority);
  const subscription = await getActiveSubscription(session.user.id, authority);
  if (!subscription) {
    return { success: false, error: 'Membership required to create a claim.' };
  }

  const defaultBranchId = subscription.branchId
    ? undefined
    : extractBranchIdFromSetting(
        (
          await withTenantAuthority(authority, tx =>
            tx.query.tenantSettings.findFirst({
              where: (ts, { and, eq }) =>
                withTenant(
                  tenantId,
                  ts.tenantId,
                  and(eq(ts.category, 'rbac'), eq(ts.key, 'default_branch_id'))
                ),
              columns: { value: true },
            })
          )
        )?.value
      );

  const result = claimSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors; // NOSONAR
    const formattedErrors = formatZodFieldErrors(errors as unknown as Record<string, string[]>);

    return { success: false, error: 'Validation failed', issues: formattedErrors };
  }

  const { title, description, category, companyName, claimAmount, currency } = result.data;
  const incidentCountry = resolveClaimIncidentCountry(result.data);

  const claimId = nanoid();
  const now = new Date();

  try {
    // The tenant directory is deny-all to the runtime RLS role, so the authoritative tenant code is
    // prepared on its own connection before the persistence transaction opens, never inside it.
    const tenantCode = (await readTenantLocaleMetadata(tenantId))?.code?.trim();
    if (!tenantCode) {
      throw new Error(`Tenant code not found for tenantId: ${tenantId}`);
    }

    // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
    await withTenantAuthority(authority, async tx => {
      // db-access-guard: tenant-scoped -- reason: tenant proof is enforced inside transaction by values or where clause
      await tx.insert(claims).values({
        id: claimId,
        tenantId,
        userId: session.user.id,
        title,
        claimNumber: null, // explicit null
        description,
        category,
        companyName,
        ...mapClaimStatusToLifecycleStates('draft'),
        ...incidentCountry,
        claimAmount: claimAmount || undefined,
        currency,
        branchId: subscription.branchId ?? defaultBranchId,
        agentId: subscription.agentId,
        createdAt: now, // Sync with generator year
        updatedAt: now,
      });

      await generateClaimNumber(
        tx,
        {
          tenantId,
          claimId,
          createdAt: now,
        },
        { tenantId, code: tenantCode }
      );

      await recordCaseCreatedEvent(tx, {
        actor: { id: session.user.id, role: session.user.role ?? 'member' },
        claimId,
        createdAt: now,
        hasDocuments: false,
        hostId: params.hostId,
        initialStatus: 'draft',
        tenantId,
      });
    });

    if (deps.logAuditEvent) {
      await deps.logAuditEvent({
        actorId: session.user.id,
        actorRole: session.user.role,
        authority,
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
    return { success: false, error: 'Failed to create claim. Please try again.' };
  }

  return { success: true };
}
