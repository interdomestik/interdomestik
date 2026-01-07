import fs from 'fs';
import path from 'path';
import { WEB_APP } from '../../utils/paths.js';

export async function auditNavigation() {
  const issues: string[] = [];
  const checks: string[] = [];

  const hasRootLayout = fs.existsSync(path.join(WEB_APP, 'src/app/layout.tsx'));
  const hasLocaleLayout = fs.existsSync(path.join(WEB_APP, 'src/app/[locale]/layout.tsx'));
  const hasRoutingConfig = fs.existsSync(path.join(WEB_APP, 'src/i18n/routing.ts'));
  const hasNavigationHelper = fs.existsSync(path.join(WEB_APP, 'src/i18n/navigation.ts'));

  if (hasNavigationHelper) {
    checks.push('✅ Navigation Helper (src/i18n/navigation.ts) exists');
  }

  // I18n pattern
  if (hasLocaleLayout && hasRoutingConfig) {
    checks.push('✅ Locale Layout (src/app/[locale]/layout.tsx) exists');
    checks.push('✅ Routing Config (src/i18n/routing.ts) exists');
    if (hasRootLayout) {
      checks.push('✅ Root Layout (src/app/layout.tsx) exists');
    } else {
      checks.push('ℹ️  Root Layout not present (using i18n locale-based routing pattern)');
    }

    return {
      content: [
        {
          type: 'text',
          text: `NAVIGATION AUDIT: SUCCESS\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\nNone`,
        },
      ],
    };
  }

  // Fallback checks
  if (hasRootLayout) checks.push('✅ Root Layout (src/app/layout.tsx) exists');
  else issues.push('❌ Missing Root Layout (src/app/layout.tsx)');

  if (hasLocaleLayout) checks.push('✅ Locale Layout (src/app/[locale]/layout.tsx) exists');
  else issues.push('❌ Missing Locale Layout (src/app/[locale]/layout.tsx)');

  if (hasRoutingConfig) checks.push('✅ Routing Config (src/i18n/routing.ts) exists');
  else issues.push('❌ Missing Routing Config (src/i18n/routing.ts)');

  const status = issues.length === 0 ? 'SUCCESS' : 'WARNING';
  return {
    content: [
      {
        type: 'text',
        text: `NAVIGATION AUDIT: ${status}\n\nCHECKS:\n${checks.join('\n')}\n\nISSUES:\n${
          issues.length > 0 ? issues.join('\n') : 'None'
        }`,
      },
    ],
  };
}
