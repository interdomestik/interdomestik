import { type AdminCrmTranslations } from './_reporting-dashboard-primitives';
import { type AdminCrmForecastBackfillOperatorCopy } from './_backfill-operator';
import { type AdminCrmForecastBackfillOperatorErrorCode } from './_backfill-types';
import { getAdminCrmRoutingErrorMessageKey } from './_routing-core';
import { type AdminCrmRoutingRulesPanelCopy } from './_routing-rules-panel';
import type {
  AdminCrmRoutingActionErrorReason,
  AdminCrmRoutingRulesPayload,
} from './_routing-types';

export type Translations = AdminCrmTranslations;

export function buildBackfillOperatorCopy(t: Translations): AdminCrmForecastBackfillOperatorCopy {
  const errorCodes: AdminCrmForecastBackfillOperatorErrorCode[] = [
    'all_dates_failed',
    'confirmation_expired',
    'confirmation_in_flight',
    'confirmation_invalid',
    'date_out_of_bounds',
    'internal_error',
    'invalid_range',
    'invalid_request',
    'invalid_tenant',
    'partial_failure',
    'range_too_large',
    'rate_limited',
    'unauthorized',
  ];
  return {
    confirmInvalidates: t('backfill.confirm.invalidates'),
    confirmWarning: t('backfill.confirm.warning'),
    dateRowsTitle: t('backfill.result.dateRows'),
    dryRunButton: t('backfill.dryRun.button'),
    dryRunHelp: t('backfill.dryRun.help'),
    error: Object.fromEntries(
      errorCodes.map(code => [code, t(`backfill.error.${code}`)])
    ) as AdminCrmForecastBackfillOperatorCopy['error'],
    fields: {
      fromDate: t('backfill.fields.fromDate'),
      maxWorkItemsPerDate: t('backfill.fields.maxWorkItemsPerDate'),
      tenantId: t('backfill.fields.tenantId'),
      toDate: t('backfill.fields.toDate'),
    },
    help: t('backfill.help'),
    noDateRows: t('backfill.result.noDateRows'),
    pendingDryRun: t('backfill.dryRun.pending'),
    pendingWrite: t('backfill.confirm.pending'),
    resultSummary: t('backfill.result.summary'),
    runWriteButton: t('backfill.confirm.button'),
    status: {
      completed: t('backfill.status.completed'),
      deferred: t('backfill.status.deferred'),
      failed: t('backfill.status.failed'),
      partial: t('backfill.status.partial'),
    },
    summary: {
      datesCompleted: t('backfill.summary.datesCompleted'),
      datesConsidered: t('backfill.summary.datesConsidered'),
      datesDeferred: t('backfill.summary.datesDeferred'),
      datesFailed: t('backfill.summary.datesFailed'),
      datesPartial: t('backfill.summary.datesPartial'),
      generatedAt: t('backfill.summary.generatedAt'),
      snapshotsInserted: t('backfill.summary.snapshotsInserted'),
      sourceRunId: t('backfill.summary.sourceRunId'),
      versionConflicts: t('backfill.summary.versionConflicts'),
      workItemsConsidered: t('backfill.summary.workItemsConsidered'),
      workItemsDeferred: t('backfill.summary.workItemsDeferred'),
      workItemsFailed: t('backfill.summary.workItemsFailed'),
      workItemsSucceeded: t('backfill.summary.workItemsSucceeded'),
    },
    table: {
      date: t('backfill.table.date'),
      failed: t('backfill.table.failed'),
      inserted: t('backfill.table.inserted'),
      status: t('backfill.table.status'),
      succeeded: t('backfill.table.succeeded'),
      workItems: t('backfill.table.workItems'),
    },
  };
}

export function buildRoutingRulesPanelCopy(
  t: Translations,
  routing: AdminCrmRoutingRulesPayload
): AdminCrmRoutingRulesPanelCopy {
  const reasons: AdminCrmRoutingActionErrorReason[] = [
    'invalid_strategy',
    'invalid_priority_or_cap',
    'invalid_window',
    'empty_agent_pool',
    'duplicate_agent_id',
    'duplicate_rule_id',
    'cross_tenant_agent',
    'branch_incompatible_agent',
    'invalid_branch',
    'self_referential_fallback',
    'branch_incompatible_rule',
    'archived_fallback',
    'disabled_fallback',
    'field_too_long',
    'unknown_field',
    'forbidden',
    'not_found',
    'cursor_conflict',
    'repository_failure',
  ];
  return {
    actions: {
      archive: t('routing.actions.archive'),
      create: t('routing.actions.create'),
      disable: t('routing.actions.disable'),
      enable: t('routing.actions.enable'),
      moveDown: t('routing.actions.moveDown'),
      moveUp: t('routing.actions.moveUp'),
      update: t('routing.actions.update'),
    },
    counts: t('routing.counts', {
      active: routing.counts.active,
      archived: routing.counts.archived,
      total: routing.rules.length,
    }),
    empty: t('routing.empty'),
    fields: {
      agentIds: t('routing.fields.agentIds'),
      branchId: t('routing.fields.branchId'),
      effectiveFrom: t('routing.fields.effectiveFrom'),
      effectiveTo: t('routing.fields.effectiveTo'),
      fallbackAgentId: t('routing.fields.fallbackAgentId'),
      fallbackRuleId: t('routing.fields.fallbackRuleId'),
      leadType: t('routing.fields.leadType'),
      maxNewLeadsPerAgentPerDay: t('routing.fields.maxNewLeadsPerAgentPerDay'),
      maxOpenLeadsPerAgent: t('routing.fields.maxOpenLeadsPerAgent'),
      priority: t('routing.fields.priority'),
      source: t('routing.fields.source'),
      strategy: t('routing.fields.strategy'),
      utmCampaign: t('routing.fields.utmCampaign'),
      utmMedium: t('routing.fields.utmMedium'),
      utmSource: t('routing.fields.utmSource'),
    },
    genericError: t('routing.error.generic'),
    reasons: Object.fromEntries(
      reasons.map(reason => [reason, t(getAdminCrmRoutingErrorMessageKey(reason))])
    ) as AdminCrmRoutingRulesPanelCopy['reasons'],
    result: {
      idle: t('routing.result.idle'),
      success: t('routing.result.success'),
    },
    rule: {
      active: t('routing.rule.active'),
      archived: t('routing.rule.archived'),
      disabled: t('routing.rule.disabled'),
      fallback: t('routing.rule.fallback'),
      filters: t('routing.rule.filters'),
      noFallback: t('routing.rule.noFallback'),
      noFilters: t('routing.rule.noFilters'),
      tenantScope: t('routing.rule.tenantScope'),
    },
    strategy: {
      least_loaded: t('routing.strategy.least_loaded'),
      manual_only: t('routing.strategy.manual_only'),
      round_robin: t('routing.strategy.round_robin'),
    },
    title: t('routing.title'),
  };
}
