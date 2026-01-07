import { z } from 'zod';

export const createBranchSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  code: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9_-]+$/, 'Code must be alphanumeric')
    .optional()
    .nullable(),
  tenantId: z.string().optional(), // For super-admin override
});

export const updateBranchSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1, 'Name is required').max(100),
  code: z
    .string()
    .min(1)
    .max(20)
    .regex(/^[a-zA-Z0-9_-]+$/, { message: 'Code must be alphanumeric' })
    .optional()
    .nullable(),
  isActive: z.boolean().optional(),
  tenantId: z.string().optional(),
});

export const deleteBranchSchema = z.object({
  branchId: z.string().uuid(),
  tenantId: z.string().optional(),
});

export const listBranchesSchema = z.object({
  tenantId: z.string().optional(),
  includeInactive: z.boolean().optional(),
});

export const grantRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.string().min(1),
  branchId: z.string().uuid().optional().nullable(),
  tenantId: z.string().optional(),
});

export const revokeRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.string().min(1),
  branchId: z.string().uuid().optional().nullable(),
  tenantId: z.string().optional(),
});

export const listUserRolesSchema = z.object({
  tenantId: z.string().optional(),
  userId: z.string().uuid().optional(),
});
