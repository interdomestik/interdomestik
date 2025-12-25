import { pgEnum } from 'drizzle-orm/pg-core';
import { CLAIM_STATUSES } from '../constants';

// Claim status workflow
export const statusEnum = pgEnum('status', CLAIM_STATUSES);

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
