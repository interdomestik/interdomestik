import type { HealthProfile } from '@/features/admin/health/health-model';

export interface BranchDashboardV2Data {
  branch: {
    id: string;
    name: string;
    code: string;
    isActive: boolean;
    currency: string;
  };
  health: HealthProfile;
  kpis: {
    openClaims: number;
    cashPending: number;
    slaBreaches: number;
    totalMembers: number;
    totalAgents: number;
  };
  pipeline: {
    status: string;
    count: number;
  }[];
  agentHealth: {
    id: string;
    name: string;
    health: HealthProfile;
    metrics: {
      openClaims: number;
      cashPending: number;
      slaBreaches: number;
    };
  }[];
  staffLoad: {
    id: string;
    name: string;
    workload: number; // in-progress claims
    severity: 'healthy' | 'attention' | 'urgent'; // derived from workload only
  }[];
}
