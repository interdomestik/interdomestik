import { classifyEntityMigrationReadinessCandidate } from './classifier';

import type {
  EntityMigrationReadinessCandidate,
  EntityMigrationReadinessOptions,
  EntityMigrationReadinessReport,
  EntityMigrationReadinessResult,
  EntityMigrationReadinessSummary,
  EntityMigrationRepairSummary,
} from './types';

export function buildEntityMigrationReadinessReport(
  candidates: readonly EntityMigrationReadinessCandidate[],
  options: EntityMigrationReadinessOptions = {}
): EntityMigrationReadinessReport {
  const results = candidates.map(candidate =>
    classifyEntityMigrationReadinessCandidate(candidate, options)
  );

  return {
    summary: summarizeResults(results),
    results,
    noWrite: true,
  };
}

export function summarizeResults(
  results: readonly EntityMigrationReadinessResult[]
): EntityMigrationReadinessSummary {
  const repairCategoryCounts: EntityMigrationRepairSummary = {};

  for (const result of results) {
    for (const category of result.repairCategories) {
      repairCategoryCounts[category] = (repairCategoryCounts[category] ?? 0) + 1;
    }
  }

  return {
    totalCandidates: results.length,
    eligibleCount: results.filter(({ status }) => status === 'eligible').length,
    blockedActiveRecoveryRunoffCount: results.filter(
      ({ status }) => status === 'blocked_active_recovery_runoff'
    ).length,
    blockedRepairRequiredCount: results.filter(({ status }) => status === 'blocked_repair_required')
      .length,
    repairCategoryCounts,
  };
}
