export const CRM_ACCOUNT_CONTACT_ROLES = [
  'decision_maker',
  'influencer',
  'billing',
  'technical',
  'other',
] as const;
export type CrmAccountContactRole = (typeof CRM_ACCOUNT_CONTACT_ROLES)[number];

export type CrmContact = {
  archivedAt?: string | null;
  archivedById?: string | null;
  branchId: string;
  createdAt: string;
  email?: string | null;
  fullName: string;
  id: string;
  phone?: string | null;
  source?: string | null;
  tenantId: string;
  updatedAt: string;
};

export type CrmAccountContact = {
  accountId: string;
  contactId: string;
  createdAt: string;
  id: string;
  isPrimary: boolean;
  role: CrmAccountContactRole;
  tenantId: string;
};

export type CrmContactRepositoryAccount = {
  archivedAt?: string | null;
  branchId?: string | null;
  id: string;
  tenantId: string;
};
