'use server';

/**
 * Branch Dashboard Types
 * V1: Read-only aggregate data for branch overview
 */

export interface BranchDashboardDTO {
  branch: BranchMetadata;
  stats: BranchStats;
  agents: BranchAgentRow[];
}

export interface BranchMetadata {
  id: string;
  name: string;
  code: string | null;
  isActive: boolean;
  tenantId: string;
}

export interface BranchStats {
  totalAgents: number;
  totalMembers: number;
  totalClaimsAllTime: number;
  claimsThisMonth: number;
}

export interface BranchAgentRow {
  agentId: string;
  agentName: string | null;
  memberCount: number;
  activeClaimCount: number;
  submittedClaimsLast30Days: number;
}
