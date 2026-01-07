import fs from 'fs';
import path from 'path';
import { WEB_APP } from '../../utils/paths.js';

export async function auditPerformance() {
  const nextConfigPath = path.join(WEB_APP, 'next.config.mjs');
  const checks: string[] = [];
  const issues: string[] = [];

  if (fs.existsSync(nextConfigPath)) {
    checks.push('✅ next.config.mjs exists');
    const content = fs.readFileSync(nextConfigPath, 'utf-8');
    if (content.includes('bundleAnalyzer')) {
      checks.push('✅ Bundle Analyzer configured');
    } else {
      issues.push('⚠️ Bundle Analyzer not configured (recommended for perf checking)');
    }
  } else {
    issues.push('❌ next.config.mjs missing');
  }

  const status = issues.length === 0 ? 'SUCCESS' : 'WARNING';
  return {
    content: [
      {
        type: 'text',
        text: `PERFORMANCE AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${
          issues.length > 0 ? issues.join('\n') : 'None'
        }`,
      },
    ],
  };
}
