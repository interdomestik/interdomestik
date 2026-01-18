export type OpsTelemetryEvent = {
  surface: 'verification' | 'claims' | 'membership' | 'leads' | 'unknown';
  action: 'view' | 'select' | 'approve' | 'reject' | 'needs_info' | 'filter' | 'search';
  entityId?: string;
  meta?: Record<string, any>;
};

const IS_DEBUG = process.env.NEXT_PUBLIC_OPS_TELEMETRY === '1';

export function trackOpsEvent(event: OpsTelemetryEvent) {
  if (IS_DEBUG) {
    console.debug('[OpsTelemetry]', event);
  }
  // Future: integrate with PostHog or internal tracking
}
