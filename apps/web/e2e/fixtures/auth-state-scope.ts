import { type TestInfo } from '@playwright/test';

import { getTenantFromTestInfo, type Tenant } from './auth.project';

export type AuthStateScope = Tenant | 'ida-ks' | 'ida-mk';

export function getAuthStateScopeFromTestInfo(testInfo: TestInfo): AuthStateScope {
  const tenant = getTenantFromTestInfo(testInfo);
  const baseURL = testInfo.project.use.baseURL?.toString();
  const hostname = baseURL ? new URL(baseURL).hostname.toLowerCase() : '';

  if (hostname.startsWith('ida.') && tenant !== 'pilot') {
    return tenant === 'mk' ? 'ida-mk' : 'ida-ks';
  }

  return tenant;
}
