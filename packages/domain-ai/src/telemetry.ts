import type { AiWorkflow } from './types';

export interface AiTelemetryInput {
  workflow: AiWorkflow;
  tenantId: string;
  promptVersion: string;
  model: string;
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  cachedInputTokens?: number | null;
  status?: string | null;
  reviewStatus?: string | null;
  costUsd?: number | null;
}

export interface AiTelemetryEvent {
  workflow: AiWorkflow;
  tenantId: string;
  promptVersion: string;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  status: string;
  reviewStatus: string;
  costUsd: number;
}

export interface AiTelemetrySummary {
  runs: number;
  averageLatencyMs: number;
  averageCostUsd: number;
  cachedInputTokenRate: number;
  humanAcceptanceRate: number;
}

export interface AiTelemetryAggregate extends Omit<AiTelemetrySummary, 'runs'> {
  totalRuns: number;
  byWorkflow: Partial<Record<AiWorkflow, AiTelemetrySummary>>;
}

function normalizeString(value: string | null | undefined, fallback: string) {
  const normalized = value?.trim();
  return normalized || fallback;
}

function normalizeCount(value: number | null | undefined) {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.round(normalized));
}

function normalizeCost(value: number | null | undefined) {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(0, Number(normalized.toFixed(6)));
}

function roundMetric(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Number(value.toFixed(4));
}

function summarizeTelemetry(events: AiTelemetryEvent[]): AiTelemetrySummary {
  if (events.length === 0) {
    return {
      runs: 0,
      averageLatencyMs: 0,
      averageCostUsd: 0,
      cachedInputTokenRate: 0,
      humanAcceptanceRate: 0,
    };
  }

  const totalLatencyMs = events.reduce((sum, event) => sum + event.latencyMs, 0);
  const totalCostUsd = events.reduce((sum, event) => sum + event.costUsd, 0);
  const totalInputTokens = events.reduce((sum, event) => sum + event.inputTokens, 0);
  const totalCachedInputTokens = events.reduce((sum, event) => sum + event.cachedInputTokens, 0);
  const approvedRuns = events.filter(event => event.reviewStatus === 'approved').length;

  return {
    runs: events.length,
    averageLatencyMs: roundMetric(totalLatencyMs / events.length),
    averageCostUsd: roundMetric(totalCostUsd / events.length),
    cachedInputTokenRate:
      totalInputTokens > 0 ? roundMetric(totalCachedInputTokens / totalInputTokens) : 0,
    humanAcceptanceRate: roundMetric(approvedRuns / events.length),
  };
}

export function createAiTelemetryEvent(input: AiTelemetryInput): AiTelemetryEvent {
  const inputTokens = normalizeCount(input.inputTokens);
  const cachedInputTokens = Math.min(normalizeCount(input.cachedInputTokens), inputTokens);

  return {
    workflow: input.workflow,
    tenantId: normalizeString(input.tenantId, 'unknown-tenant'),
    promptVersion: normalizeString(input.promptVersion, 'unknown_prompt'),
    model: normalizeString(input.model, 'unknown-model'),
    latencyMs: normalizeCount(input.latencyMs),
    inputTokens,
    outputTokens: normalizeCount(input.outputTokens),
    cachedInputTokens,
    status: normalizeString(input.status, 'completed'),
    reviewStatus: normalizeString(input.reviewStatus, 'pending'),
    costUsd: normalizeCost(input.costUsd),
  };
}

export function aggregateAiTelemetry(events: AiTelemetryEvent[]): AiTelemetryAggregate {
  const grouped: Partial<Record<AiWorkflow, AiTelemetryEvent[]>> = {};

  for (const event of events) {
    const existing = grouped[event.workflow] ?? [];
    existing.push(event);
    grouped[event.workflow] = existing;
  }

  const overall = summarizeTelemetry(events);
  const byWorkflow: Partial<Record<AiWorkflow, AiTelemetrySummary>> = {};

  for (const workflow of Object.keys(grouped) as AiWorkflow[]) {
    byWorkflow[workflow] = summarizeTelemetry(grouped[workflow] ?? []);
  }

  return {
    totalRuns: overall.runs,
    averageLatencyMs: overall.averageLatencyMs,
    averageCostUsd: overall.averageCostUsd,
    cachedInputTokenRate: overall.cachedInputTokenRate,
    humanAcceptanceRate: overall.humanAcceptanceRate,
    byWorkflow,
  };
}
