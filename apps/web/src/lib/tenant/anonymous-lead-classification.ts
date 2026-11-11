import { z } from 'zod';

export const PUBLIC_ONBOARDING_TENANTS = ['tenant_ks', 'tenant_mk', 'pilot-mk'] as const;
export type PublicOnboardingTenant = (typeof PUBLIC_ONBOARDING_TENANTS)[number];
export type ClassificationIssue = 'required' | 'conflict' | 'unavailable';

export class AnonymousLeadClassificationError extends Error {
  constructor(public readonly issue: ClassificationIssue) {
    super(issue);
    this.name = 'AnonymousLeadClassificationError';
  }
}

export const anonymousLeadClassificationSchema = z
  .object({
    choice: z.enum(PUBLIC_ONBOARDING_TENANTS).optional(),
    bookingHints: z.array(z.enum(PUBLIC_ONBOARDING_TENANTS)).max(1).optional(),
  })
  .strict();
export type AnonymousLeadClassification = z.infer<typeof anonymousLeadClassificationSchema>;

export function classifyAnonymousLead(input: unknown): PublicOnboardingTenant {
  const parsed = anonymousLeadClassificationSchema.safeParse(input);
  if (!parsed.success) throw new AnonymousLeadClassificationError('unavailable');
  const { choice, bookingHints = [] } = parsed.data;
  const hint = bookingHints[0];
  if (choice && hint && choice !== hint) throw new AnonymousLeadClassificationError('conflict');
  const tenantId = choice ?? hint;
  if (!tenantId) throw new AnonymousLeadClassificationError('required');
  return tenantId;
}

/** Preserve cardinality and raw values; no trimming or ambient request classification. */
export function readAnonymousLeadClassification(form: FormData): unknown {
  const choices = form.getAll('onboardingTenant');
  return {
    choice: choices.length > 1 ? choices : choices[0] || undefined,
    bookingHints: form.getAll('default_booking_tenant_id'),
  };
}

export function classificationIssueFromCode(code?: string): ClassificationIssue | undefined {
  if (code === 'CLASSIFICATION_REQUIRED') return 'required';
  if (code === 'CLASSIFICATION_CONFLICT') return 'conflict';
  if (code === 'CLASSIFICATION_UNAVAILABLE' || code === 'TENANT_AUTHORITY_REQUIRED')
    return 'unavailable';
  return undefined;
}
