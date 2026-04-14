import type { Browser, Page, TestInfo } from '@playwright/test';

export async function withAnonymousPage<T>(
  browser: Browser,
  testInfo: TestInfo,
  callback: (page: Page) => Promise<T>
): Promise<T> {
  const context = await browser.newContext({
    storageState: undefined,
    baseURL:
      typeof testInfo.project.use.baseURL === 'string'
        ? testInfo.project.use.baseURL
        : testInfo.project.use.baseURL?.toString(),
    extraHTTPHeaders: testInfo.project.use.extraHTTPHeaders,
  });
  const page = await context.newPage();

  try {
    return await callback(page);
  } finally {
    await context.close();
  }
}
