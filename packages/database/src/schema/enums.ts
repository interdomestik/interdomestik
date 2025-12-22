import { pgEnum } from 'drizzle-orm/pg-core';

// Claim status workflow
export const statusEnum = pgEnum('status', [
  'draft',
  'submitted', // Phase 1: Submission
  'verification', // Phase 2: Information Verification
  'evaluation', // Phase 3: Damages Evaluation
  'negotiation', // Phase 4: Offer & Negotiation
  'court', // Phase 5: Judicial Process (if needed)
  'resolved', // Phase 6: Final Resolution (Success)
  'rejected', // Phase 6: Final Resolution (Failure)
]);

export const documentCategoryEnum = pgEnum('document_category', [
  'evidence',
  'correspondence',
  'contract',
  'receipt',
  'other',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'paused',
  'canceled',
  'trialing',
  'expired',
]);

export const membershipTierEnum = pgEnum('membership_tier', [
  'basic',
  'standard',
  'family',
  'business',
]);

export const commissionStatusEnum = pgEnum('commission_status', [
  'pending',
  'approved',
  'paid',
  'void',
]);

export const commissionTypeEnum = pgEnum('commission_type', [
  'new_membership',
  'renewal',
  'upgrade',
  'b2b',
]);

export const noteTypeEnum = pgEnum('note_type', [
  'call',
  'meeting',
  'email',
  'general',
  'follow_up',
  'issue',
]);
