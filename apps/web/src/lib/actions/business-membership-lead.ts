'use server';

import * as Sentry from '@sentry/nextjs';
import { createLead } from '@interdomestik/domain-leads';
import { headers } from 'next/headers';
import { z } from 'zod';

import { resolveBusinessLeadOwner } from '@/lib/business-leads/resolve-business-lead-owner';
import { runCommercialActionWithIdempotency } from '@/lib/commercial-action-idempotency';
import { enforceRateLimitForAction } from '@/lib/rate-limit';
import type { ActionError, ActionSuccess } from '@/lib/safe-action';
import { resolveTenantIdFromRequest } from '@/lib/tenant/tenant-request';

const submitBusinessMembershipLeadSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  companyName: z.string().trim().min(1, 'Company name is required'),
  email: z.string().trim().email('Enter a valid business email'),
  phone: z.string().trim().min(5, 'Phone number is required'),
  teamSize: z.string().trim().min(1, 'Team size is required'),
  notes: z.string().trim().max(2000, 'Notes are too long').optional(),
  locale: z.string().trim().min(2).max(10).optional(),
});

export type SubmitBusinessMembershipLeadInput = z.infer<typeof submitBusinessMembershipLeadSchema>;

export type SubmitBusinessMembershipLeadResult = ActionSuccess<{ leadId: string }> | ActionError;

function formatFieldErrors(fieldErrors: Record<string, string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(fieldErrors)
      .filter(([, value]) => Boolean(value?.[0]))
      .map(([key, value]) => [key, value?.[0] ?? 'Invalid input'])
  );
}

function readOptionalString(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function serializeLeadNotes(args: {
  data: SubmitBusinessMembershipLeadInput;
  referer: string | null;
}): string {
  const referer = args.referer;
  let refererUrl: URL | null = null;

  if (referer) {
    try {
      refererUrl = new URL(referer);
    } catch {
      refererUrl = null;
    }
  }

  return JSON.stringify({
    source: 'business_membership_public',
    companyName: args.data.companyName,
    teamSize: args.data.teamSize,
    locale: args.data.locale ?? null,
    note: args.data.notes ?? null,
    landingPage: referer,
    utmSource: refererUrl?.searchParams.get('utm_source') ?? null,
    utmMedium: refererUrl?.searchParams.get('utm_medium') ?? null,
    utmCampaign: refererUrl?.searchParams.get('utm_campaign') ?? null,
    utmContent: refererUrl?.searchParams.get('utm_content') ?? null,
    utmTerm: refererUrl?.searchParams.get('utm_term') ?? null,
  });
}

export async function submitBusinessMembershipLeadCore(params: {
  idempotencyKey?: string;
  requestHeaders: Headers;
  data: SubmitBusinessMembershipLeadInput;
}): Promise<SubmitBusinessMembershipLeadResult> {
  try {
    return await runCommercialActionWithIdempotency({
      action: 'business-membership.submit',
      idempotencyKey: params.idempotencyKey,
      requestFingerprint: params.data,
      execute: async () => {
        const limit = await enforceRateLimitForAction({
          name: 'action:business-membership-lead',
          limit: 6,
          windowSeconds: 600,
          headers: params.requestHeaders,
          keySuffix: params.data.email,
          productionSensitive: true,
        });

        if (limit.limited) {
          return {
            success: false,
            error: 'Too many requests. Please try again later.',
            code: 'RATE_LIMITED',
          };
        }

        const parsed = submitBusinessMembershipLeadSchema.safeParse(params.data);

        if (!parsed.success) {
          return {
            success: false,
            error: 'Validation failed',
            code: 'INVALID_PAYLOAD',
            issues: formatFieldErrors(parsed.error.flatten().fieldErrors),
          };
        }

        const tenantId = await resolveTenantIdFromRequest();
        const owner = await resolveBusinessLeadOwner(tenantId);

        if (!owner) {
          return {
            success: false,
            error: 'Business intake is temporarily unavailable. Please contact support directly.',
            code: 'OWNER_UNAVAILABLE',
          };
        }

        const { leadId } = await createLead(
          {
            tenantId,
            agentId: owner.agentId,
            branchId: owner.branchId,
          },
          {
            firstName: parsed.data.firstName,
            lastName: parsed.data.lastName,
            email: parsed.data.email,
            phone: parsed.data.phone,
            notes: serializeLeadNotes({
              data: parsed.data,
              referer: params.requestHeaders.get('referer'),
            }),
          }
        );

        return {
          success: true,
          data: {
            leadId,
          },
        };
      },
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: {
        action: 'submitBusinessMembershipLead',
        feature: 'business-membership',
      },
    });

    return {
      success: false,
      error: 'Internal Server Error',
      code: 'INTERNAL_SERVER_ERROR',
    };
  }
}

export async function submitBusinessMembershipLead(
  prevState: SubmitBusinessMembershipLeadResult | null,
  formData: FormData
): Promise<SubmitBusinessMembershipLeadResult> {
  const requestHeaders = await headers();

  return submitBusinessMembershipLeadCore({
    idempotencyKey: readOptionalString(formData.get('_idempotencyKey')),
    requestHeaders,
    data: {
      firstName: readOptionalString(formData.get('firstName')) ?? '',
      lastName: readOptionalString(formData.get('lastName')) ?? '',
      companyName: readOptionalString(formData.get('companyName')) ?? '',
      email: readOptionalString(formData.get('email')) ?? '',
      phone: readOptionalString(formData.get('phone')) ?? '',
      teamSize: readOptionalString(formData.get('teamSize')) ?? '',
      notes: readOptionalString(formData.get('notes')),
      locale: readOptionalString(formData.get('locale')),
    },
  });
}
