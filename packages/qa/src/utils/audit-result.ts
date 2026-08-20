type AuditResult = {
  isError?: boolean;
  structuredContent?: { status?: unknown };
};

export type AuditStatus = 'pass' | 'fail' | 'warning';

export function classifyAuditResult(result: unknown, text: string): AuditStatus {
  const audit = result && typeof result === 'object' ? (result as AuditResult) : {};
  const structuredStatus = audit.structuredContent?.status;
  if (audit.isError === true || structuredStatus === 'fail' || structuredStatus === 'error') {
    return 'fail';
  }
  if (structuredStatus === 'pass') return 'pass';

  const normalized = text.toLowerCase();
  if (text.includes('❌') || normalized.includes('error') || normalized.includes('failed')) {
    return 'fail';
  }
  if (text.includes('⚠️') || normalized.includes('warning')) return 'warning';
  if (text.includes('✅') || normalized.includes('success')) return 'pass';
  return 'warning';
}
