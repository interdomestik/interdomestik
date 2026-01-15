// v2.0.0-ops — Admin Claims lifecycle hardening
import type { ClaimStatus } from '@interdomestik/database/constants';

export type ClaimStatusFilter = 'active' | 'draft' | 'closed' | undefined;
export type ClaimLifecycleStage = ClaimStatus | 'unknown';
export type ClaimOwnerRole = 'staff' | 'member' | 'agent' | 'admin' | 'system' | 'unknown';

export interface ClaimsListV2Filters {
  tenantId: string;
  role: string | null;
  branchId: string | null;
  userId: string;
  page?: number;
  perPage?: number;
  statusFilter?: ClaimStatusFilter;
  statuses?: ClaimStatus[];
  assignment?: 'all' | 'assigned' | 'unassigned' | 'me';
  search?: string;
}

export interface ClaimsListV2Row {
  id: string;
  claimNumber: string | null;
  title: string;
  status: ClaimStatus;
  statusLabelKey: string;
  currentStage: ClaimLifecycleStage;
  currentOwnerRole: ClaimOwnerRole;
  isStuck: boolean;
  daysInCurrentStage: number;
  claimantName: string;
  claimantEmail: string;
  branchId: string | null;
  branchCode: string | null;
  branchName: string | null;
  staffName: string | null;
  staffEmail: string | null;
  assignedAt: Date | null;
  amount: string | null; // formatted amount
  currency: string;
  createdAt: Date | null;
  updatedAt: Date | null;
  unreadCount: number;
  category: string | null;
}

export interface ClaimsListV2Dto {
  rows: ClaimsListV2Row[];
  totals: {
    active: number;
    draft: number;
    closed: number;
  };
  pagination: {
    page: number;
    perPage: number;
    totalCount: number;
    totalPages: number;
  };
}

export const IN_PROGRESS_STATUSES: ClaimStatus[] = [
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
];

export const CLOSED_STATUSES: ClaimStatus[] = ['resolved', 'rejected'];

export const DRAFT_STATUSES: ClaimStatus[] = ['draft'];
