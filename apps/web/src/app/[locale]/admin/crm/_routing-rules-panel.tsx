'use client';

import { Archive, ArrowDown, ArrowUp, PauseCircle, PlayCircle, Save } from 'lucide-react';
import { useActionState, type ReactNode } from 'react';

import {
  archiveRoutingRuleAction,
  createRoutingRuleAction,
  reorderRoutingRulesAction,
  setRoutingRuleEnabledAction,
  updateRoutingRuleAction,
  type AdminCrmRoutingActionState,
} from './_routing-action';
import {
  ADMIN_CRM_ROUTING_MARKER_PREFIX,
  ADMIN_CRM_ROUTING_RULE_ACTION_RESULT_MARKER,
  ADMIN_CRM_ROUTING_RULE_FORM_MARKER,
  ADMIN_CRM_ROUTING_RULES_LIST_MARKER,
  type AdminCrmRoutingActionErrorReason,
  type AdminCrmRoutingRuleSummary,
  type AdminCrmRoutingRulesPayload,
} from './_routing-types';

const initialActionState: AdminCrmRoutingActionState = { status: 'idle' };

export type AdminCrmRoutingRulesPanelCopy = {
  actions: {
    archive: string;
    create: string;
    disable: string;
    enable: string;
    moveDown: string;
    moveUp: string;
    update: string;
  };
  counts: string;
  empty: string;
  fields: {
    agentIds: string;
    branchId: string;
    effectiveFrom: string;
    effectiveTo: string;
    fallbackAgentId: string;
    fallbackRuleId: string;
    leadType: string;
    maxNewLeadsPerAgentPerDay: string;
    maxOpenLeadsPerAgent: string;
    priority: string;
    source: string;
    strategy: string;
    utmCampaign: string;
    utmMedium: string;
    utmSource: string;
  };
  genericError: string;
  result: {
    idle: string;
    success: string;
  };
  rule: {
    active: string;
    archived: string;
    disabled: string;
    fallback: string;
    filters: string;
    noFallback: string;
    noFilters: string;
    tenantScope: string;
  };
  reasons: Record<AdminCrmRoutingActionErrorReason, string>;
  strategy: {
    least_loaded: string;
    manual_only: string;
    round_robin: string;
  };
  title: string;
};

export function AdminCrmRoutingRulesPanel({
  copy,
  payload,
}: Readonly<{
  copy: AdminCrmRoutingRulesPanelCopy;
  payload: AdminCrmRoutingRulesPayload;
}>) {
  const [createState, createAction, createPending] = useActionState(
    createRoutingRuleAction,
    initialActionState
  );
  const [reorderState, reorderAction, reorderPending] = useActionState(
    reorderRoutingRulesAction,
    initialActionState
  );
  const activeRules = payload.rules.filter(rule => !rule.archived);

  return (
    <section className="space-y-4 rounded-md border bg-background p-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold">{copy.title}</h2>
          <p className="text-sm text-muted-foreground">{copy.counts}</p>
        </div>
        <ActionResult
          copy={copy}
          state={createState.status === 'idle' ? reorderState : createState}
        />
      </div>

      <form
        action={createAction}
        className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4"
        data-testid={ADMIN_CRM_ROUTING_RULE_FORM_MARKER}
      >
        <RuleFields copy={copy} />
        <div className="flex items-end">
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60"
            disabled={createPending}
            type="submit"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {copy.actions.create}
          </button>
        </div>
      </form>

      <div data-testid={ADMIN_CRM_ROUTING_RULES_LIST_MARKER}>
        {payload.rules.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {copy.empty}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">{copy.fields.priority}</th>
                  <th className="py-2 pr-3 font-medium">{copy.fields.strategy}</th>
                  <th className="py-2 pr-3 font-medium">{copy.fields.branchId}</th>
                  <th className="py-2 pr-3 font-medium">{copy.rule.filters}</th>
                  <th className="py-2 pr-3 font-medium">{copy.fields.agentIds}</th>
                  <th className="py-2 pr-3 font-medium">{copy.rule.fallback}</th>
                  <th className="py-2 font-medium">{copy.actions.update}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payload.rules.map(rule => (
                  <RoutingRuleRow
                    activeRules={activeRules}
                    copy={copy}
                    key={rule.id}
                    reorderAction={reorderAction}
                    reorderPending={reorderPending}
                    rule={rule}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function RoutingRuleRow({
  activeRules,
  copy,
  reorderAction,
  reorderPending,
  rule,
}: Readonly<{
  activeRules: readonly AdminCrmRoutingRuleSummary[];
  copy: AdminCrmRoutingRulesPanelCopy;
  reorderAction: (payload: FormData) => void;
  reorderPending: boolean;
  rule: AdminCrmRoutingRuleSummary;
}>) {
  const [updateState, updateAction, updatePending] = useActionState(
    updateRoutingRuleAction,
    initialActionState
  );
  const [enabledState, enabledAction, enabledPending] = useActionState(
    setRoutingRuleEnabledAction,
    initialActionState
  );
  const [archiveState, archiveAction, archivePending] = useActionState(
    archiveRoutingRuleAction,
    initialActionState
  );
  const rowState = currentRowState(updateState, enabledState, archiveState);
  const scopeLabel = rule.scope.kind === 'tenant' ? copy.rule.tenantScope : rule.scope.branchLabel;
  const filterLabel = filterSummary(rule, copy);
  const fallbackLabel = fallbackSummary(rule, copy);
  const scopedRules = activeRules.filter(candidate => sameScope(candidate, rule));
  const index = scopedRules.findIndex(candidate => candidate.id === rule.id);
  const statusLabel = ruleStatusLabel(rule, copy);

  return (
    <tr
      className={rule.archived ? 'text-muted-foreground' : undefined}
      data-testid={`${ADMIN_CRM_ROUTING_MARKER_PREFIX}rule-row`}
    >
      <td className="py-3 pr-3 align-top">
        <div className="flex items-center gap-2">
          <span>{rule.priority}</span>
          {rule.archived ? null : (
            <div className="flex gap-1">
              <ReorderButton
                action={reorderAction}
                branchId={rule.scope.kind === 'branch' ? rule.scope.branchId : null}
                disabled={reorderPending || index <= 0}
                label={copy.actions.moveUp}
                ruleIds={moveRule(scopedRules, index, -1)}
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </ReorderButton>
              <ReorderButton
                action={reorderAction}
                branchId={rule.scope.kind === 'branch' ? rule.scope.branchId : null}
                disabled={reorderPending || index < 0 || index >= scopedRules.length - 1}
                label={copy.actions.moveDown}
                ruleIds={moveRule(scopedRules, index, 1)}
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </ReorderButton>
            </div>
          )}
        </div>
      </td>
      <td className="py-3 pr-3 align-top">
        <div className="space-y-1">
          <div className="font-medium">{copy.strategy[rule.strategy]}</div>
          <div className="text-xs text-muted-foreground">{statusLabel}</div>
        </div>
      </td>
      <td className="py-3 pr-3 align-top">{scopeLabel}</td>
      <td className="py-3 pr-3 align-top">{filterLabel}</td>
      <td className="py-3 pr-3 align-top">{rule.agentPoolCount}</td>
      <td className="break-all py-3 pr-3 align-top">{fallbackLabel}</td>
      <td className="py-3 align-top">
        <div className="space-y-2">
          <form action={updateAction} className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <input name="ruleId" type="hidden" value={rule.id} />
            <input name="expectedUpdatedAt" type="hidden" value={rule.updatedAt} />
            <RuleFields copy={copy} rule={rule} />
            <button
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border px-2 text-xs font-medium disabled:opacity-60"
              data-testid={`${ADMIN_CRM_ROUTING_MARKER_PREFIX}update-button`}
              disabled={updatePending || rule.archived}
              type="submit"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              {copy.actions.update}
            </button>
          </form>
          <div className="flex flex-wrap gap-2">
            <form action={enabledAction}>
              <input name="ruleId" type="hidden" value={rule.id} />
              <input name="enabled" type="hidden" value={rule.enabled ? 'false' : 'true'} />
              <button
                className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-60"
                data-testid={`${ADMIN_CRM_ROUTING_MARKER_PREFIX}enabled-button`}
                disabled={enabledPending || rule.archived}
                type="submit"
              >
                {rule.enabled ? (
                  <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {rule.enabled ? copy.actions.disable : copy.actions.enable}
              </button>
            </form>
            <form action={archiveAction}>
              <input name="ruleId" type="hidden" value={rule.id} />
              <button
                className="inline-flex h-8 items-center gap-1 rounded-md border px-2 text-xs disabled:opacity-60"
                data-testid={`${ADMIN_CRM_ROUTING_MARKER_PREFIX}archive-button`}
                disabled={archivePending || rule.archived}
                type="submit"
              >
                <Archive className="h-3.5 w-3.5" aria-hidden="true" />
                {copy.actions.archive}
              </button>
            </form>
          </div>
          <ActionResult copy={copy} state={rowState} />
        </div>
      </td>
    </tr>
  );
}

function RuleFields({
  copy,
  rule,
}: Readonly<{
  copy: AdminCrmRoutingRulesPanelCopy;
  rule?: AdminCrmRoutingRuleSummary;
}>) {
  const inputClass = 'h-9 rounded-md border bg-background px-2 text-sm';
  return (
    <>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.strategy}
        <select
          className={inputClass}
          defaultValue={rule?.strategy ?? 'round_robin'}
          name="strategy"
        >
          <option value="round_robin">{copy.strategy.round_robin}</option>
          <option value="least_loaded">{copy.strategy.least_loaded}</option>
          <option value="manual_only">{copy.strategy.manual_only}</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.priority}
        <input
          className={inputClass}
          defaultValue={rule?.priority ?? 0}
          min={0}
          name="priority"
          type="number"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.branchId}
        <input
          className={inputClass}
          defaultValue={rule?.scope.kind === 'branch' ? rule.scope.branchId : ''}
          name="branchId"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.agentIds}
        <input className={inputClass} defaultValue="" name="agentIds" />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.source}
        <input className={inputClass} defaultValue={rule?.filters.source ?? ''} name="source" />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.leadType}
        <input className={inputClass} defaultValue={rule?.filters.leadType ?? ''} name="leadType" />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.utmSource}
        <input
          className={inputClass}
          defaultValue={rule?.filters.utmSource ?? ''}
          name="utmSource"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.utmMedium}
        <input
          className={inputClass}
          defaultValue={rule?.filters.utmMedium ?? ''}
          name="utmMedium"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.utmCampaign}
        <input
          className={inputClass}
          defaultValue={rule?.filters.utmCampaign ?? ''}
          name="utmCampaign"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.effectiveFrom}
        <input
          className={inputClass}
          defaultValue={rule?.effectiveWindow.from ?? ''}
          name="effectiveFrom"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.effectiveTo}
        <input
          className={inputClass}
          defaultValue={rule?.effectiveWindow.to ?? ''}
          name="effectiveTo"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.maxNewLeadsPerAgentPerDay}
        <input
          className={inputClass}
          defaultValue={rule?.capacityCaps.maxNewLeadsPerAgentPerDay ?? ''}
          min={0}
          name="maxNewLeadsPerAgentPerDay"
          type="number"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.maxOpenLeadsPerAgent}
        <input
          className={inputClass}
          defaultValue={rule?.capacityCaps.maxOpenLeadsPerAgent ?? ''}
          min={0}
          name="maxOpenLeadsPerAgent"
          type="number"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.fallbackAgentId}
        <input
          className={inputClass}
          defaultValue={rule?.fallback.agentId ?? ''}
          name="fallbackAgentId"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium">
        {copy.fields.fallbackRuleId}
        <input
          className={inputClass}
          defaultValue={rule?.fallback.ruleId ?? ''}
          name="fallbackRuleId"
        />
      </label>
    </>
  );
}

function ReorderButton({
  action,
  branchId,
  children,
  disabled,
  label,
  ruleIds,
}: Readonly<{
  action: (payload: FormData) => void;
  branchId: string | null;
  children: ReactNode;
  disabled: boolean;
  label: string;
  ruleIds: readonly string[];
}>) {
  return (
    <form action={action}>
      <input name="branchId" type="hidden" value={branchId ?? ''} />
      <input name="ruleIds" type="hidden" value={ruleIds.join(',')} />
      <button
        aria-label={label}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border disabled:opacity-40"
        data-testid={`${ADMIN_CRM_ROUTING_MARKER_PREFIX}reorder-button`}
        disabled={disabled}
        title={label}
        type="submit"
      >
        {children}
      </button>
    </form>
  );
}

function ActionResult({
  copy,
  state,
}: Readonly<{ copy: AdminCrmRoutingRulesPanelCopy; state: AdminCrmRoutingActionState }>) {
  if (state.status === 'idle') return null;
  const text = actionResultText(state, copy);
  return (
    <output
      aria-live="polite"
      className="text-xs text-muted-foreground"
      data-testid={ADMIN_CRM_ROUTING_RULE_ACTION_RESULT_MARKER}
    >
      {text}
    </output>
  );
}

function currentRowState(
  updateState: AdminCrmRoutingActionState,
  enabledState: AdminCrmRoutingActionState,
  archiveState: AdminCrmRoutingActionState
): AdminCrmRoutingActionState {
  if (updateState.status !== 'idle') return updateState;
  if (enabledState.status !== 'idle') return enabledState;
  return archiveState;
}

function fallbackSummary(
  rule: AdminCrmRoutingRuleSummary,
  copy: AdminCrmRoutingRulesPanelCopy
): string {
  const fallbackIds = [rule.fallback.agentId, rule.fallback.ruleId].filter(Boolean);
  return fallbackIds.length > 0 ? fallbackIds.join(' / ') : copy.rule.noFallback;
}

function ruleStatusLabel(
  rule: AdminCrmRoutingRuleSummary,
  copy: AdminCrmRoutingRulesPanelCopy
): string {
  if (rule.archived) return copy.rule.archived;
  return rule.enabled ? copy.rule.active : copy.rule.disabled;
}

function actionResultText(
  state: AdminCrmRoutingActionState,
  copy: AdminCrmRoutingRulesPanelCopy
): string {
  if (state.status === 'idle') return copy.result.idle;
  if (state.status === 'ok') return copy.result.success;
  return copy.reasons[state.reason] ?? copy.genericError;
}

function filterSummary(
  rule: AdminCrmRoutingRuleSummary,
  copy: AdminCrmRoutingRulesPanelCopy
): string {
  const values = [
    rule.filters.source,
    rule.filters.leadType,
    rule.filters.utmSource,
    rule.filters.utmMedium,
    rule.filters.utmCampaign,
  ].filter(Boolean);
  return values.length > 0 ? values.join(' / ') : copy.rule.noFilters;
}

function sameScope(left: AdminCrmRoutingRuleSummary, right: AdminCrmRoutingRuleSummary): boolean {
  if (left.scope.kind !== right.scope.kind) return false;
  if (left.scope.kind === 'tenant' && right.scope.kind === 'tenant') return true;
  if (left.scope.kind === 'branch' && right.scope.kind === 'branch') {
    return left.scope.branchId === right.scope.branchId;
  }
  return false;
}

function moveRule(
  rules: readonly AdminCrmRoutingRuleSummary[],
  index: number,
  delta: -1 | 1
): string[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= rules.length) return rules.map(rule => rule.id);
  const next = rules.map(rule => rule.id);
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
