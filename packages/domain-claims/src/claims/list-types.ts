import type { SessionWithTenant } from '@interdomestik/shared-auth';

export type ClaimsScope =
  'member' | 'admin' | 'staff_queue' | 'staff_all' | 'staff_unassigned' | 'agent_queue';

export type ClaimItem = {
  id: string;
  title: string | null;
  status: string | null;
  createdAt: string | null;
  companyName: string | null;
  claimAmount: string | null;
  currency: string | null;
  category: string | null;
  claimantName?: string | null;
  claimantEmail?: string | null;
  claimNumber?: string | null;
  unreadCount?: number;
};

export type ClaimsListResponse = {
  success: boolean;
  claims?: ClaimItem[];
  page?: number;
  perPage?: number;
  totalCount?: number;
  totalPages?: number;
  error?: string;
};

export type ListClaimsParams = {
  session: SessionWithTenant;
  scope: ClaimsScope;
  status?: string;
  search?: string;
  page: number;
  perPage: number;
};
