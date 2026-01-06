import { z } from 'zod';

export const evidenceFileSchema = z.object({
  id: z.string(),
  name: z.string(),
  path: z.string(),
  type: z.string(),
  size: z.number().nonnegative(),
  bucket: z.string(),
  classification: z.string().default('pii'),
});

export const claimCategorySchema = z.object({
  category: z.string().min(1, 'Category is required'),
});

export const claimDetailsSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  companyName: z.string().min(2, 'Company name is required'),
  description: z.string().min(20, 'Please provide more detail (min 20 chars)'),
  incidentDate: z
    .string()
    .refine((val: string) => !Number.isNaN(Date.parse(val)), {
      message: 'Invalid date',
    })
    .optional(), // Made optional as it's not in DB yet
  claimAmount: z.string().optional(), // Can be parsed to number on server
  currency: z.string().default('EUR'),
  voiceNoteUrl: z.string().optional(),
});

export const claimEvidenceSchema = z.object({
  files: z.array(evidenceFileSchema).default([]),
});

// Merged schema for final submission
export const createClaimSchema = claimCategorySchema
  .merge(claimDetailsSchema)
  .merge(claimEvidenceSchema);

const VALID_STATUSES = [
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
  'resolved',
  'rejected',
] as const;

export const claimStatusSchema = z.object({
  status: z.enum(VALID_STATUSES),
});

export const assignClaimSchema = z.object({
  staffId: z.string().min(1, 'Staff ID is required').nullable(),
});

export type ClaimCategoryValues = z.infer<typeof claimCategorySchema>;
export type ClaimDetailsValues = z.infer<typeof claimDetailsSchema>;
export type EvidenceFile = z.infer<typeof evidenceFileSchema>;
export type CreateClaimValues = z.infer<typeof createClaimSchema>;
export type ClaimStatusValues = z.infer<typeof claimStatusSchema>;
export type AssignClaimValues = z.infer<typeof assignClaimSchema>;
