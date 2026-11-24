import type { Browser, Page } from '@playwright/test';

export function createOtpJourneyBrowser(
  browser: Browser,
  baseURL: string | undefined,
  client: (offset: number) => Record<string, string>
) {
  const pages: Page[] = [];
  const browserAuthOrigins: string[] = [];
  const browserAuthHeaderReads: Promise<void>[] = [];
  const open = async () => {
    const context = await browser.newContext({
      baseURL,
      extraHTTPHeaders: client(pages.length),
      storageState: { cookies: [], origins: [] },
    });
    context.on('request', request => {
      const url = new URL(request.url());
      if (request.method() === 'POST' && url.pathname.startsWith('/api/auth/')) {
        browserAuthHeaderReads.push(
          request.allHeaders().then(headers => {
            browserAuthOrigins.push(headers.origin ?? '');
          })
        );
      }
    });
    const page = await context.newPage();
    pages.push(page);
    return page;
  };

  return { open, pages, browserAuthOrigins, browserAuthHeaderReads };
}
