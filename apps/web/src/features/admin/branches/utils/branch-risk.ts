import { BranchWithKpis } from '@/features/admin/branches/server/getBranchesWithKpis';

export type Severity = 'healthy' | 'watch' | 'urgent' | 'inactive';

export interface BranchRiskProfile {
  severity: Severity;
  healthScore: number;
  labelKey: string;
  colorClass: string;
  badgeClass: string;
}

/**
 * Computes the severity level based on KPIs and active status
 */
export function computeSeverity(stats: {
  openClaims: number;
  cashPending: number;
  slaBreaches: number;
  isActive: boolean;
}): Severity {
  if (!stats.isActive) return 'inactive';

  // 1. SLA Breaches (Most Critical)
  // 0 -> Green, 1 -> Amber, 2+ -> Red
  if (stats.slaBreaches >= 2) return 'urgent';

  // 2. Cash Pending (Financial Risk)
  // 0 -> Green, 1-2 -> Amber, 3+ -> Red
  if (stats.cashPending >= 3) return 'urgent';

  // 3. Open Claims (Operational Load)
  // 0-4 -> Green, 5-14 -> Amber, 15+ -> Red
  if (stats.openClaims >= 15) return 'urgent';

  // Check for Watch/Amber conditions if not Urgent
  if (stats.slaBreaches >= 1) return 'watch';
  if (stats.cashPending >= 1) return 'watch';
  if (stats.openClaims >= 5) return 'watch';

  return 'healthy';
}

/**
 * Computes a deterministic health score (0-100)
 */
export function computeHealthScore(stats: {
  openClaims: number;
  cashPending: number;
  slaBreaches: number;
  isActive: boolean;
}): number {
  if (!stats.isActive) return 0;

  const openClaimsPenalty = Math.min(60, stats.openClaims * 2);
  const cashPendingPenalty = Math.min(25, stats.cashPending * 8);
  const slaPenalty = Math.min(40, stats.slaBreaches * 15);

  const rawScore = 100 - openClaimsPenalty - cashPendingPenalty - slaPenalty;

  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, rawScore));
}

/**
 * Derives UI properties for a given severity
 */
export function getRiskProfile(
  severity: Severity
): Omit<BranchRiskProfile, 'severity' | 'healthScore'> {
  switch (severity) {
    case 'urgent':
      return {
        labelKey: 'health.urgent',
        colorClass: 'border-red-500 shadow-red-500/10',
        badgeClass: 'bg-red-500/10 text-red-500 border-red-500/20',
      };
    case 'watch':
      return {
        labelKey: 'health.watch',
        colorClass: 'border-amber-500 shadow-amber-500/10',
        badgeClass: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      };
    case 'inactive':
      // Gray styling
      return {
        labelKey: 'health.inactive',
        colorClass: 'border-slate-200 dark:border-slate-800 opacity-75',
        badgeClass:
          'bg-slate-100/50 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
      };
    case 'healthy':
    default:
      return {
        labelKey: 'health.healthy',
        colorClass: 'border-emerald-500/30 shadow-emerald-500/5',
        badgeClass: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
      };
  }
}

export function analyzeBranchRisk(branch: BranchWithKpis): BranchRiskProfile {
  const stats = {
    openClaims: branch.kpis?.openClaims ?? 0,
    cashPending: branch.kpis?.cashPending ?? 0,
    slaBreaches: branch.kpis?.slaBreaches ?? 0,
    isActive: branch.isActive,
  };

  const severity = computeSeverity(stats);
  const healthScore = computeHealthScore(stats);
  const uiProps = getRiskProfile(severity);

  return {
    severity,
    healthScore,
    ...uiProps,
  };
}
