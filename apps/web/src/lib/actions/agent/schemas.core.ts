import { CRM_LEAD_STAGES, type CrmLeadStage } from '@interdomestik/domain-crm/leads/mutations';
import { z } from 'zod';

export const MAX_MEMBER_IMPORT_ROWS = 200;

export function isLeadStage(value: unknown): value is CrmLeadStage {
  return CRM_LEAD_STAGES.includes(value as CrmLeadStage);
}

export const createLeadSchema = z.object({
  type: z.enum(['individual', 'business']),
  stage: z.enum(CRM_LEAD_STAGES),
  fullName: z.string().min(2, 'Name is required'),
  companyName: z.string().optional(),
  email: z.union([z.string().email(), z.literal('')]).optional(),
  phone: z.string().min(6, 'Phone is required'),
  source: z.string().min(1, 'Source is required'),
  notes: z.string().optional(),
});

export const registerMemberSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(5, 'Phone is required'),
  password: z.string().min(6, 'Password is required'),
  planId: z.enum(['standard', 'family']),
  notes: z.string().optional(),
});

export const importMemberRowSchema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().min(5, 'Phone is required'),
  password: z.string().min(6, 'Password is required'),
  planId: z.enum(['standard', 'family']).default('standard'),
});

export const importMembersSchema = z.object({
  rows: z.array(importMemberRowSchema).max(MAX_MEMBER_IMPORT_ROWS),
});

export type ImportMemberRowInput = z.infer<typeof importMemberRowSchema>;
