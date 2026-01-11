import { Activity, AlertOctagon, AlertTriangle, Ban } from 'lucide-react';

export type HealthSeverity = 'healthy' | 'attention' | 'urgent' | 'inactive';

export interface HealthScoreInput {
  openClaims: number;
  cashPending: number;
  slaBreaches: number;
  isActive: boolean;
}

export interface HealthProfile {
  score: number;
  severity: HealthSeverity;
  labelKey: string;
  count: number; // The main metric driving the score (optional context)
}

/**
 * Health Model V2.1 — Stable Scoring
 *
 * Computes a deterministic health score (0-100) based on critical risk factors.
 * - Base Score: 100
 * - Penalties: Open claims (smooth), Cash pending (strong), SLA breaches (strongest).
 * - Inactive: Returns 0 score and 'inactive' severity.
 *
 * Thresholds:
 * - 90-100: Healthy
 * - 75-89:  Attention
 * - 40-74:  Urgent
 * - 0 (inactive): Inactive
 */
export function computeHealthScore(input: HealthScoreInput): {
  score: number;
  severity: HealthSeverity;
  labelKey: string;
} {
  if (!input.isActive) {
    return {
      score: 0,
      severity: 'inactive',
      labelKey: 'health_status_inactive',
    };
  }

  // Defensive: treat undefined/negative as 0
  const openClaims = Math.max(0, input.openClaims || 0);
  const cashPending = Math.max(0, input.cashPending || 0);
  const slaBreaches = Math.max(0, input.slaBreaches || 0);

  // V2.1 Penalty Calculation (Capped, Integer)
  // Open Claims: smooth curve, capped at 45
  const openClaimsPenalty = Math.min(45, Math.floor(openClaims / 2 + openClaims * 0.5));
  // Cash Pending: strong penalty, capped at 45
  const cashPenalty = Math.min(45, cashPending * 12);
  // SLA Breaches: strongest penalty, capped at 70
  const slaPenalty = Math.min(70, slaBreaches * 25);

  // Total penalties and raw score
  const penalties = openClaimsPenalty + cashPenalty + slaPenalty;
  const rawScore = 100 - penalties;

  // Clamp 0-100
  const score = Math.max(0, Math.min(100, rawScore));

  return {
    score,
    severity: severityFromScore(score),
    labelKey: labelKeyFromScore(score),
  };
}

/**
 * V2.1 Severity Thresholds:
 * - 90-100: Healthy
 * - 75-89:  Attention
 * - 40-74:  Urgent
 * - <40:    Urgent (critical)
 */
export function severityFromScore(score: number): HealthSeverity {
  if (score >= 90) return 'healthy';
  if (score >= 75) return 'attention';
  return 'urgent';
}

function labelKeyFromScore(score: number): string {
  if (score >= 90) return 'health_status_healthy';
  if (score >= 75) return 'health_status_attention';
  return 'health_status_urgent';
}

/**
 * Returns Tailwind CSS classes for a given severity.
 * Consistent with GlassCard design system.
 */
export function severityStyles(severity: HealthSeverity): {
  border: string;
  badge: string;
  text: string;
  icon: string;
} {
  switch (severity) {
    case 'healthy':
      return {
        border: 'border-emerald-500/50',
        badge: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
        text: 'text-emerald-600',
        icon: 'text-emerald-500',
      };
    case 'attention':
      return {
        border: 'border-amber-500/50',
        badge: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
        text: 'text-amber-600',
        icon: 'text-amber-500',
      };
    case 'urgent':
      return {
        border: 'border-red-500/50',
        badge: 'bg-red-500/10 text-red-600 border-red-500/20',
        text: 'text-red-600',
        icon: 'text-red-500',
      };
    case 'inactive':
    default:
      return {
        border: 'border-slate-300 dark:border-slate-700',
        badge:
          'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
        text: 'text-slate-500',
        icon: 'text-slate-400',
      };
  }
}

/**
 * Returns the Lucide icon component for a severity level.
 */
export function severityIcon(severity: HealthSeverity) {
  switch (severity) {
    case 'healthy':
      return Activity;
    case 'attention':
      return AlertTriangle;
    case 'urgent':
      return AlertOctagon;
    case 'inactive':
      return Ban;
  }
}
