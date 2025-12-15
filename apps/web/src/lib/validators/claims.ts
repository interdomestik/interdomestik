import { z } from 'zod';

export const claimCategorySchema = z.object({
  category: z.string().min(1, 'Category is required'),
});

export const claimDetailsSchema = z.object({
  title: z.string().min(5, 'Title must be at least 5 characters'),
  companyName: z.string().min(2, 'Company name is required'),
  description: z.string().min(20, 'Please provide more detail (min 20 chars)'),
  incidentDate: z
    .string()
    .refine(val => !isNaN(Date.parse(val)), {
      message: 'Invalid date',
    })
    .optional(), // Made optional as it's not in DB yet
  claimAmount: z.string().optional(), // Can be parsed to number on server
  currency: z.string().default('EUR'),
});

export const claimEvidenceSchema = z.object({
  // specific schema for File objects isn't directly possibly in server actions payload easily without FormData
  // For the wizard state, we might verify we have at least 1 file if required.
  // For now, optional as it handles uploads separately
  files: z.array(z.any()).optional(),
});

// Merged schema for final submission
export const createClaimSchema = claimCategorySchema
  .merge(claimDetailsSchema)
  .merge(claimEvidenceSchema);

export type ClaimCategoryValues = z.infer<typeof claimCategorySchema>;
export type ClaimDetailsValues = z.infer<typeof claimDetailsSchema>;
export type CreateClaimValues = z.infer<typeof createClaimSchema>;
