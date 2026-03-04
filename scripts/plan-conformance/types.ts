export type ConformanceMode = 'advisory' | 'enforced';

export type ConformanceDecision = 'continue' | 'pause' | 'rollback';

export type ConformanceCheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface ConformanceCheckResultV1 {
  name: string;
  status: ConformanceCheckStatus;
  required?: boolean;
  notes?: string;
}

export interface ConformanceStepRecordV1 {
  step_id: string;
  epic_id: string;
  mode: ConformanceMode;
  files_changed: string[];
  checks: ConformanceCheckResultV1[];
  result: 'pass' | 'fail';
  variance: boolean;
  decision: ConformanceDecision;
  owner: string;
  timestamp: string;
}

export interface AdvisorySignalReportV1 {
  run_id: string;
  retrieval_hits: string[];
  noise_flags: string[];
  boundary_findings: string[];
  usefulness_score: number;
}

export interface PromotionThresholdsV1 {
  phase_c_control_regressions: number;
  unrelated_pr_noise_pct: number;
  retrieval_usefulness_pct: number;
  gate_runtime_increase_pct: number;
  boundary_report_stable: boolean;
  tenant_boundary_regressions: number;
  consecutive_weeks: number;
}

export interface PromotionDecisionV1 {
  window: string;
  thresholds: PromotionThresholdsV1;
  pass_fail: boolean;
  approvers: string[];
  effective_mode: ConformanceMode;
}

export type MemoryRecordStatusV1 = 'candidate' | 'validated' | 'canonical' | 'obsolete';

export type MemoryStoreTypeV1 = 'episodic' | 'procedural' | 'semantic';

export type MemoryPromotionRuleV1 = 'auto_policy' | 'owner_approval' | 'hitl_required';

export interface MemoryScopeV1 {
  file_path?: string;
  route?: string;
  table?: string;
  tenant?: string;
}

export interface MemoryRecordV1 {
  id: string;
  status: MemoryRecordStatusV1;
  store_type: MemoryStoreTypeV1;
  trigger_signature: string;
  risk_class: string;
  scope: MemoryScopeV1;
  lesson: string;
  verification_commands: string[];
  promotion_rule: MemoryPromotionRuleV1;
  supersedes: string[];
  conflicts_with: string[];
  created_at: string;
  updated_at: string;
}
