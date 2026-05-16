import type { CrmActorContext } from '@interdomestik/domain-crm/context';
import type { CrmRoutingStrategy } from '@interdomestik/domain-crm/routing';
import { z } from 'zod';

import {
  adminCrmRoutingRuleRepository,
  type AdminCrmRoutingRuleAdminRepository,
  type AdminCrmRoutingRuleRow,
  type AdminCrmRoutingRuleWriteInput,
} from '@/lib/domain-crm/routing-repository';

import { ADMIN_CRM_FORBIDDEN_PII_KEYS } from './_core';
import {
  ADMIN_CRM_ROUTING_ERROR_MESSAGE_BY_REASON,
  type AdminCrmRoutingActionErrorReason,
  type AdminCrmRoutingActionResult,
  type AdminCrmRoutingRuleSummary,
  type AdminCrmRoutingRulesPayload,
} from './_routing-types';

export const ADMIN_CRM_ROUTING_STRING_MAX_LENGTH = 128;
export const ADMIN_CRM_ROUTING_ACTION_STRATEGIES = [
  'round_robin',
  'least_loaded',
  'manual_only',
] as const satisfies readonly CrmRoutingStrategy[];

const ADMIN_CRM_ROUTING_ADMIN_ROLES = new Set(['admin', 'tenant_admin', 'super_admin']);

const nullableTextSchema = z
  .string()
  .trim()
  .max(ADMIN_CRM_ROUTING_STRING_MAX_LENGTH)
  .optional()
  .nullable()
  .transform(value => {
    const normalized = value?.trim();
    return normalized || null;
  });

const nullableIdSchema = z
  .string()
  .trim()
  .max(ADMIN_CRM_ROUTING_STRING_MAX_LENGTH)
  .optional()
  .nullable()
  .transform(value => {
    const normalized = value?.trim();
    return normalized || null;
  });

const agentIdsSchema = z.array(z.string().trim().min(1).max(ADMIN_CRM_ROUTING_STRING_MAX_LENGTH));

const routingRuleWriteSchema = z
  .object({
    agentIds: agentIdsSchema,
    branchId: nullableIdSchema,
    effectiveFrom: nullableTextSchema,
    effectiveTo: nullableTextSchema,
    enabled: z.boolean().optional(),
    fallbackAgentId: nullableIdSchema,
    fallbackRuleId: nullableIdSchema,
    leadType: nullableTextSchema,
    maxNewLeadsPerAgentPerDay: z.number().int().nonnegative().optional().nullable(),
    maxOpenLeadsPerAgent: z.number().int().nonnegative().optional().nullable(),
    priority: z.number().int().nonnegative(),
    source: nullableTextSchema,
    strategy: z.enum(ADMIN_CRM_ROUTING_ACTION_STRATEGIES),
    utmCampaign: nullableTextSchema,
    utmMedium: nullableTextSchema,
    utmSource: nullableTextSchema,
  })
  .strict();

const updateRoutingRuleSchema = routingRuleWriteSchema
  .extend({
    agentIds: agentIdsSchema.optional(),
    expectedUpdatedAt: z.string().min(1),
    priority: z.number().int().nonnegative().optional(),
    ruleId: z.string().trim().min(1).max(ADMIN_CRM_ROUTING_STRING_MAX_LENGTH),
  })
  .strict();

const ruleIdSchema = z
  .object({
    ruleId: z.string().trim().min(1).max(ADMIN_CRM_ROUTING_STRING_MAX_LENGTH),
  })
  .strict();

const enabledSchema = ruleIdSchema
  .extend({
    enabled: z.boolean(),
  })
  .strict();

const reorderSchema = z
  .object({
    branchId: nullableIdSchema,
    ruleIds: z.array(z.string().trim().min(1).max(ADMIN_CRM_ROUTING_STRING_MAX_LENGTH)),
  })
  .strict();

export interface AdminCrmRoutingSession {
  user?: {
    branchId?: string | null;
    id?: string;
    role?: string | null;
    tenantId?: string | null;
  } | null;
}

export class AdminCrmRoutingAccessDeniedError extends Error {
  constructor() {
    super('Admin CRM routing access denied');
    this.name = 'AdminCrmRoutingAccessDeniedError';
  }
}

export type AdminCrmRoutingActionKind = 'archive' | 'create' | 'reorder' | 'set_enabled' | 'update';

export type RunAdminCrmRoutingRuleActionDeps = {
  logger?: Pick<Console, 'error'>;
  repository?: AdminCrmRoutingRuleAdminRepository;
};

export function resolveAdminCrmRoutingActor(
  session: AdminCrmRoutingSession | null
): CrmActorContext | null {
  const role = session?.user?.role;
  const actorId = session?.user?.id;
  const tenantId = session?.user?.tenantId;
  if (!role || !actorId || !tenantId) return null;
  if (!ADMIN_CRM_ROUTING_ADMIN_ROLES.has(role)) return null;
  return {
    actorId,
    role: 'admin',
    scope: { branchId: session?.user?.branchId ?? null },
    tenantId,
  };
}

export async function getAdminCrmRoutingRulesCore(
  args: { actor: CrmActorContext },
  deps: { repository?: AdminCrmRoutingRuleAdminRepository } = {}
): Promise<AdminCrmRoutingRulesPayload> {
  if (args.actor.role !== 'admin') throw new AdminCrmRoutingAccessDeniedError();
  const repository = deps.repository ?? adminCrmRoutingRuleRepository;
  const [rules, branches] = await Promise.all([
    repository.listRoutingRulesForAdmin({ actor: args.actor }),
    repository.listBranches({ tenantId: args.actor.tenantId }),
  ]);
  const branchLabels = new Map(branches.map(branch => [branch.id, branch.label]));
  const summaries = rules.map(rule => toRuleSummary(rule, branchLabels));
  return {
    counts: {
      active: summaries.filter(rule => rule.enabled && !rule.archived).length,
      archived: summaries.filter(rule => rule.archived).length,
    },
    rules: summaries,
  };
}

export async function runAdminCrmRoutingRuleAction(
  args: {
    input: unknown;
    kind: AdminCrmRoutingActionKind;
    session: AdminCrmRoutingSession | null;
  },
  deps: RunAdminCrmRoutingRuleActionDeps = {}
): Promise<AdminCrmRoutingActionResult> {
  const actor = resolveAdminCrmRoutingActor(args.session);
  if (!actor) return { reason: 'forbidden', status: 'error' };

  const repository = deps.repository ?? adminCrmRoutingRuleRepository;
  try {
    if (args.kind === 'create') return await createRule(actor, args.input, repository);
    if (args.kind === 'update') return await updateRule(actor, args.input, repository);
    if (args.kind === 'set_enabled') return await setEnabled(actor, args.input, repository);
    if (args.kind === 'archive') return await archiveRule(actor, args.input, repository);
    return await reorderRules(actor, args.input, repository);
  } catch (error) {
    (deps.logger ?? console).error('[Admin CRM Routing] action failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      kind: args.kind,
      tenantId: actor.tenantId,
    });
    return { reason: 'repository_failure', status: 'error' };
  }
}

export function assertNoAdminCrmRoutingPiiKeys(value: unknown): void {
  const keys = new Set<string>();
  collectKeys(value, keys);
  for (const key of keys) {
    if ((ADMIN_CRM_FORBIDDEN_PII_KEYS as readonly string[]).includes(key)) {
      throw new Error(`Admin CRM routing output contains PII key: ${key}`);
    }
  }
}

function toRuleSummary(
  rule: AdminCrmRoutingRuleRow,
  branchLabels: ReadonlyMap<string, string>
): AdminCrmRoutingRuleSummary {
  return {
    agentPoolCount: rule.agentIds.length,
    archived: Boolean(rule.archivedAt),
    capacityCaps: {
      maxNewLeadsPerAgentPerDay: rule.maxNewLeadsPerAgentPerDay ?? null,
      maxOpenLeadsPerAgent: rule.maxOpenLeadsPerAgent ?? null,
    },
    effectiveWindow: {
      from: rule.effectiveFrom ?? null,
      to: rule.effectiveTo ?? null,
    },
    enabled: rule.enabled,
    fallback: {
      agentId: rule.fallbackAgentId ?? null,
      ruleId: rule.fallbackRuleId ?? null,
    },
    filters: {
      leadType: rule.leadType ?? null,
      source: rule.source ?? null,
      utmCampaign: rule.utmCampaign ?? null,
      utmMedium: rule.utmMedium ?? null,
      utmSource: rule.utmSource ?? null,
    },
    id: rule.id,
    priority: rule.priority,
    scope: rule.branchId
      ? {
          branchId: rule.branchId,
          branchLabel: branchLabels.get(rule.branchId) ?? rule.branchId,
          kind: 'branch',
        }
      : { kind: 'tenant' },
    strategy: rule.strategy,
    updatedAt: rule.updatedAt,
  };
}

async function createRule(
  actor: CrmActorContext,
  input: unknown,
  repository: AdminCrmRoutingRuleAdminRepository
): Promise<AdminCrmRoutingActionResult> {
  const parsed = parseRuleWriteInput(input);
  if (!('input' in parsed)) return parsed;
  const validation = await validateRuleWriteInput(actor, parsed.input, repository);
  if (validation) return validation;
  const rule = await repository.createRoutingRule({ actor, input: parsed.input });
  return { ruleId: rule.id, status: 'ok' };
}

async function updateRule(
  actor: CrmActorContext,
  input: unknown,
  repository: AdminCrmRoutingRuleAdminRepository
): Promise<AdminCrmRoutingActionResult> {
  const parsed = updateRoutingRuleSchema.safeParse(input);
  if (!parsed.success) return zodErrorResult(parsed.error);
  const existing = await repository.getRoutingRule({ actor, ruleId: parsed.data.ruleId });
  if (!existing) return { reason: 'not_found', status: 'error' };
  if (existing.archivedAt) return { reason: 'not_found', status: 'error' };
  const mergedInput = mergeRoutingRuleUpdateInput(existing, parsed.data);
  const validation = await validateRuleWriteInput(actor, mergedInput, repository, existing.id);
  if (validation) return validation;
  const updated = await repository.updateRoutingRule({
    actor,
    expectedUpdatedAt: parsed.data.expectedUpdatedAt,
    input: mergedInput,
    ruleId: parsed.data.ruleId,
  });
  if (!updated) return { reason: 'not_found', status: 'error' };
  if (updated === 'cursor_conflict') return { reason: 'cursor_conflict', status: 'error' };
  return { ruleId: updated.id, status: 'ok' };
}

function mergeRoutingRuleUpdateInput(
  existing: AdminCrmRoutingRuleRow,
  input: Omit<Partial<AdminCrmRoutingRuleWriteInput>, 'agentIds'> & {
    agentIds?: readonly string[];
  }
): AdminCrmRoutingRuleWriteInput {
  return {
    agentIds: input.agentIds ?? existing.agentIds,
    branchId: input.branchId ?? null,
    effectiveFrom: input.effectiveFrom ?? null,
    effectiveTo: input.effectiveTo ?? null,
    enabled: input.enabled ?? existing.enabled,
    fallbackAgentId: input.fallbackAgentId ?? null,
    fallbackRuleId: input.fallbackRuleId ?? null,
    leadType: input.leadType ?? null,
    maxNewLeadsPerAgentPerDay: input.maxNewLeadsPerAgentPerDay ?? null,
    maxOpenLeadsPerAgent: input.maxOpenLeadsPerAgent ?? null,
    priority: input.priority ?? existing.priority,
    source: input.source ?? null,
    strategy: input.strategy ?? existing.strategy,
    utmCampaign: input.utmCampaign ?? null,
    utmMedium: input.utmMedium ?? null,
    utmSource: input.utmSource ?? null,
  };
}

async function setEnabled(
  actor: CrmActorContext,
  input: unknown,
  repository: AdminCrmRoutingRuleAdminRepository
): Promise<AdminCrmRoutingActionResult> {
  const parsed = enabledSchema.safeParse(input);
  if (!parsed.success) return zodErrorResult(parsed.error);
  const existing = await repository.getRoutingRule({ actor, ruleId: parsed.data.ruleId });
  if (!existing || existing.archivedAt) return { reason: 'not_found', status: 'error' };
  const rule = await repository.setRoutingRuleEnabled({
    actor,
    enabled: parsed.data.enabled,
    ruleId: parsed.data.ruleId,
  });
  return rule ? { ruleId: rule.id, status: 'ok' } : { reason: 'not_found', status: 'error' };
}

async function archiveRule(
  actor: CrmActorContext,
  input: unknown,
  repository: AdminCrmRoutingRuleAdminRepository
): Promise<AdminCrmRoutingActionResult> {
  const parsed = ruleIdSchema.safeParse(input);
  if (!parsed.success) return zodErrorResult(parsed.error);
  const existing = await repository.getRoutingRule({ actor, ruleId: parsed.data.ruleId });
  if (!existing) return { reason: 'not_found', status: 'error' };
  if (existing.archivedAt) return { ruleId: existing.id, status: 'ok' };
  const rule = await repository.archiveRoutingRule({ actor, ruleId: parsed.data.ruleId });
  return rule ? { ruleId: rule.id, status: 'ok' } : { reason: 'not_found', status: 'error' };
}

async function reorderRules(
  actor: CrmActorContext,
  input: unknown,
  repository: AdminCrmRoutingRuleAdminRepository
): Promise<AdminCrmRoutingActionResult> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return zodErrorResult(parsed.error);
  if (hasDuplicates(parsed.data.ruleIds)) {
    return { field: 'ruleIds', reason: 'duplicate_rule_id', status: 'error' };
  }
  const rows = await repository.reorderRoutingRules({
    actor,
    branchId: parsed.data.branchId,
    ruleIds: parsed.data.ruleIds,
  });
  if (rows.length !== parsed.data.ruleIds.length) {
    return { reason: 'branch_incompatible_rule', status: 'error' };
  }
  return { ruleId: rows[0]?.id ?? parsed.data.ruleIds[0] ?? '', status: 'ok' };
}

function parseRuleWriteInput(
  input: unknown
): { status: 'ok'; input: AdminCrmRoutingRuleWriteInput } | AdminCrmRoutingActionResult {
  const parsed = routingRuleWriteSchema.safeParse(input);
  if (!parsed.success) return zodErrorResult(parsed.error);
  return { input: parsed.data, status: 'ok' };
}

async function validateRuleWriteInput(
  actor: CrmActorContext,
  input: AdminCrmRoutingRuleWriteInput,
  repository: AdminCrmRoutingRuleAdminRepository,
  currentRuleId?: string
): Promise<AdminCrmRoutingActionResult | null> {
  return (
    validateRuleShape(input, currentRuleId) ??
    (await validateRuleAgents(actor, input, repository)) ??
    (await validateRuleBranch(actor, input, repository)) ??
    (await validateFallbackRule(actor, input, repository))
  );
}

function validateRuleShape(
  input: AdminCrmRoutingRuleWriteInput,
  currentRuleId?: string
): AdminCrmRoutingActionResult | null {
  if (!ADMIN_CRM_ROUTING_ACTION_STRATEGIES.includes(input.strategy)) {
    return { field: 'strategy', reason: 'invalid_strategy', status: 'error' };
  }
  const windowValidation = validateEffectiveWindow(input.effectiveFrom, input.effectiveTo);
  if (windowValidation) return windowValidation;
  if (input.strategy !== 'manual_only' && input.agentIds.length === 0) {
    return { field: 'agentIds', reason: 'empty_agent_pool', status: 'error' };
  }
  if (hasDuplicates(input.agentIds)) {
    return { field: 'agentIds', reason: 'duplicate_agent_id', status: 'error' };
  }
  if (input.fallbackRuleId && input.fallbackRuleId === currentRuleId) {
    return { field: 'fallbackRuleId', reason: 'self_referential_fallback', status: 'error' };
  }
  return null;
}

async function validateRuleAgents(
  actor: CrmActorContext,
  input: AdminCrmRoutingRuleWriteInput,
  repository: AdminCrmRoutingRuleAdminRepository
): Promise<AdminCrmRoutingActionResult | null> {
  const agentIds = [
    ...new Set(
      [...input.agentIds, input.fallbackAgentId].filter(
        (agentId): agentId is string => typeof agentId === 'string' && agentId.length > 0
      )
    ),
  ];
  const agents = await repository.listAgentScopes({ agentIds, tenantId: actor.tenantId });
  const agentById = new Map(agents.map(agent => [agent.id, agent]));
  for (const agentId of agentIds) {
    const agent = agentById.get(agentId);
    if (!agent || agent.tenantId !== actor.tenantId || agent.role !== 'agent') {
      return { field: 'agentIds', reason: 'cross_tenant_agent', status: 'error' };
    }
    if (input.branchId && agent.branchId !== input.branchId) {
      return { field: 'agentIds', reason: 'branch_incompatible_agent', status: 'error' };
    }
  }
  return null;
}

async function validateRuleBranch(
  actor: CrmActorContext,
  input: AdminCrmRoutingRuleWriteInput,
  repository: AdminCrmRoutingRuleAdminRepository
): Promise<AdminCrmRoutingActionResult | null> {
  if (!input.branchId) return null;
  const branches = await repository.listBranches({ tenantId: actor.tenantId });
  return branches.some(branch => branch.id === input.branchId)
    ? null
    : { field: 'branchId', reason: 'invalid_branch', status: 'error' };
}

async function validateFallbackRule(
  actor: CrmActorContext,
  input: AdminCrmRoutingRuleWriteInput,
  repository: AdminCrmRoutingRuleAdminRepository
): Promise<AdminCrmRoutingActionResult | null> {
  if (!input.fallbackRuleId) return null;
  const fallback = await repository.getRoutingRule({ actor, ruleId: input.fallbackRuleId });
  if (!fallback)
    return { field: 'fallbackRuleId', reason: 'branch_incompatible_rule', status: 'error' };
  if (fallback.archivedAt)
    return { field: 'fallbackRuleId', reason: 'archived_fallback', status: 'error' };
  if (!fallback.enabled)
    return { field: 'fallbackRuleId', reason: 'disabled_fallback', status: 'error' };
  return (fallback.branchId ?? null) === (input.branchId ?? null)
    ? null
    : { field: 'fallbackRuleId', reason: 'branch_incompatible_rule', status: 'error' };
}

function validateEffectiveWindow(
  effectiveFrom: string | null | undefined,
  effectiveTo: string | null | undefined
): AdminCrmRoutingActionResult | null {
  const from = parseRoutingDate(effectiveFrom);
  const to = parseRoutingDate(effectiveTo);
  if (from === false || to === false) {
    return {
      field: from === false ? 'effectiveFrom' : 'effectiveTo',
      reason: 'invalid_window',
      status: 'error',
    };
  }
  if (from && to && from.getTime() > to.getTime()) {
    return { field: 'effectiveFrom', reason: 'invalid_window', status: 'error' };
  }
  return null;
}

function parseRoutingDate(value: string | null | undefined): Date | null | false {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? false : date;
}

function hasDuplicates(values: readonly string[]): boolean {
  return new Set(values).size !== values.length;
}

function zodErrorResult(error: z.ZodError): AdminCrmRoutingActionResult {
  const issue = error.issues[0];
  if (!issue) return { reason: 'repository_failure', status: 'error' };
  if (issue.code === 'unrecognized_keys') return { reason: 'unknown_field', status: 'error' };
  const field = issue.path[0]?.toString();
  if (issue.code === 'invalid_value' && field === 'strategy') {
    return { field, reason: 'invalid_strategy', status: 'error' };
  }
  if (issue.code === 'too_big') {
    return { field, reason: 'field_too_long', status: 'error' };
  }
  if (['priority', 'maxNewLeadsPerAgentPerDay', 'maxOpenLeadsPerAgent'].includes(field ?? '')) {
    return { field, reason: 'invalid_priority_or_cap', status: 'error' };
  }
  return { field, reason: 'unknown_field', status: 'error' };
}

function collectKeys(value: unknown, keys: Set<string>): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    collectKeys(child, keys);
  }
}

export function getAdminCrmRoutingErrorMessageKey(
  reason: AdminCrmRoutingActionErrorReason
): string {
  return ADMIN_CRM_ROUTING_ERROR_MESSAGE_BY_REASON[reason];
}
