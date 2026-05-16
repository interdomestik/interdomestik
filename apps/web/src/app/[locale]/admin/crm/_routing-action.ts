'use server';

import { revalidatePath } from 'next/cache';

import { getSessionSafe } from '@/components/shell/session';
import { LOCALES } from '@/i18n/locales';

import {
  resolveAdminCrmRoutingActor,
  runAdminCrmRoutingRuleAction,
  type AdminCrmRoutingActionKind,
} from './_routing-core';
import type { AdminCrmRoutingActionResult } from './_routing-types';

export type AdminCrmRoutingActionState = AdminCrmRoutingActionResult | { status: 'idle' };

const ID_LIST_SEPARATOR = /[\s,]+/;

export async function createRoutingRuleAction(
  _previousState: AdminCrmRoutingActionState,
  formData: FormData
): Promise<AdminCrmRoutingActionState> {
  return runAction('create', formData, formDataToRuleInput);
}

export async function updateRoutingRuleAction(
  _previousState: AdminCrmRoutingActionState,
  formData: FormData
): Promise<AdminCrmRoutingActionState> {
  return runAction('update', formData, updateFormDataToRuleInput);
}

export async function setRoutingRuleEnabledAction(
  _previousState: AdminCrmRoutingActionState,
  formData: FormData
): Promise<AdminCrmRoutingActionState> {
  return runAction('set_enabled', formData, formData => ({
    enabled: stringValue(formData, 'enabled') === 'true',
    ruleId: stringValue(formData, 'ruleId'),
  }));
}

export async function archiveRoutingRuleAction(
  _previousState: AdminCrmRoutingActionState,
  formData: FormData
): Promise<AdminCrmRoutingActionState> {
  return runAction('archive', formData, formData => ({ ruleId: stringValue(formData, 'ruleId') }));
}

export async function reorderRoutingRulesAction(
  _previousState: AdminCrmRoutingActionState,
  formData: FormData
): Promise<AdminCrmRoutingActionState> {
  return runAction('reorder', formData, formData => ({
    branchId: nullableStringValue(formData, 'branchId'),
    ruleIds: splitIds(stringValue(formData, 'ruleIds')),
  }));
}

async function runAction(
  kind: AdminCrmRoutingActionKind,
  formData: FormData,
  toInput: (formData: FormData) => unknown
): Promise<AdminCrmRoutingActionState> {
  const session = await getSessionSafe(`AdminCrmRoutingRuleAction:${kind}`);
  if (!resolveAdminCrmRoutingActor(session)) return { reason: 'forbidden', status: 'error' };
  const input = toInput(formData);
  const result = await runAdminCrmRoutingRuleAction({ input, kind, session });
  if (result.status === 'ok') revalidateAdminCrmForAllLocales();
  return result;
}

function updateFormDataToRuleInput(formData: FormData) {
  return {
    ...formDataToRuleInput(formData, {
      defaultEnabled: null,
      defaultPriority: null,
      preserveBlankAgentIds: true,
    }),
    expectedUpdatedAt: stringValue(formData, 'expectedUpdatedAt'),
    ruleId: stringValue(formData, 'ruleId'),
  };
}

function formDataToRuleInput(
  formData: FormData,
  options: {
    defaultEnabled?: boolean | null;
    defaultPriority?: number | null;
    preserveBlankAgentIds?: boolean;
  } = {}
) {
  const agentIds = splitIds(stringValue(formData, 'agentIds'));
  const enabledValue = formData.get('enabled');
  const defaultEnabled = options.defaultEnabled === undefined ? true : options.defaultEnabled;
  const parsedPriority = nullableNumberValue(formData, 'priority');
  const priority =
    parsedPriority ?? (options.defaultPriority === undefined ? 0 : options.defaultPriority);
  const input: Record<string, unknown> = {
    branchId: nullableStringValue(formData, 'branchId'),
    effectiveFrom: nullableStringValue(formData, 'effectiveFrom'),
    effectiveTo: nullableStringValue(formData, 'effectiveTo'),
    fallbackAgentId: nullableStringValue(formData, 'fallbackAgentId'),
    fallbackRuleId: nullableStringValue(formData, 'fallbackRuleId'),
    leadType: nullableStringValue(formData, 'leadType'),
    maxNewLeadsPerAgentPerDay: nullableNumberValue(formData, 'maxNewLeadsPerAgentPerDay'),
    maxOpenLeadsPerAgent: nullableNumberValue(formData, 'maxOpenLeadsPerAgent'),
    source: nullableStringValue(formData, 'source'),
    strategy: stringValue(formData, 'strategy'),
    utmCampaign: nullableStringValue(formData, 'utmCampaign'),
    utmMedium: nullableStringValue(formData, 'utmMedium'),
    utmSource: nullableStringValue(formData, 'utmSource'),
  };
  if (enabledValue !== null) input.enabled = stringValue(formData, 'enabled') !== 'false';
  else if (defaultEnabled !== null) input.enabled = defaultEnabled;
  if (priority !== null) input.priority = priority;
  if (!options.preserveBlankAgentIds || agentIds.length > 0) input.agentIds = agentIds;
  return input;
}

function stringValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function nullableStringValue(formData: FormData, key: string): string | null {
  const value = stringValue(formData, key);
  return value || null;
}

function nullableNumberValue(formData: FormData, key: string): number | null {
  const value = stringValue(formData, key);
  if (!value) return null;
  return Number(value);
}

function splitIds(value: string): string[] {
  return value
    .split(ID_LIST_SEPARATOR)
    .map(item => item.trim())
    .filter(Boolean);
}

function revalidateAdminCrmForAllLocales(): void {
  for (const locale of LOCALES) {
    revalidatePath(`/${locale}/admin/crm`);
  }
}
