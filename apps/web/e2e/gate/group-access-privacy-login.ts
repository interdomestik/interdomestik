import type { Page, TestInfo } from '@playwright/test';
import { E2E_PASSWORD } from '@interdomestik/database';

import { ipForRole } from '../fixtures/auth.project';
import type { OfficeSeededAgent } from './group-access-privacy-consent.fixture';

export async function loginAsOfficeSeededAgent(
  page: Page,
  testInfo: TestInfo,
  officeAgent: OfficeSeededAgent
) {
  const baseUrl = testInfo.project.use.baseURL?.toString() ?? '';
  const origin = new URL(baseUrl).origin;
  const response = await page.request.post(`${origin}/api/auth/sign-in/email`, {
    data: { email: officeAgent.email, password: E2E_PASSWORD },
    headers: {
      Origin: origin,
      Referer: `${origin}/login`,
      'x-forwarded-for': ipForRole('agent'),
      ...testInfo.project.use.extraHTTPHeaders,
    },
  });

  if (!response.ok()) {
    const text = await response.text();
    throw new Error(`API login failed for ${officeAgent.email}: ${response.status()} ${text}`);
  }
}
