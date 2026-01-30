import { expect, Page } from '@playwright/test';

export async function assertNoTenantChooser(page: Page): Promise<void> {
  await expect(page.getByTestId('tenant-chooser')).toHaveCount(0);
}

export function attachDialogDiagnostics(page: Page): void {
  page.on('dialog', async dialog => {
    const type = dialog.type();
    const message = dialog.message();
    console.warn(`[E2E Dialog] type=${type} message=${JSON.stringify(message)}`);
    try {
      await dialog.dismiss();
    } catch {
      // Ignore dialog dismissal errors (best-effort).
    }
  });

  page.on('framenavigated', frame => {
    if (frame === page.mainFrame()) {
      console.log(`[E2E Nav] ${frame.url()}`);
    }
  });

  page.on('requestfailed', request => {
    if (request.resourceType() !== 'document') return;
    const failure = request.failure();
    console.warn(
      `[E2E RequestFailed] ${request.method()} ${request.url()} ${failure?.errorText ?? ''}`
    );
  });

  page.on('response', response => {
    const req = response.request();
    if (req.resourceType() !== 'document') return;
    const url = response.url();
    if (!/\/admin\/branches|\/login/i.test(url)) return;
    console.log(`[E2E DocResponse] ${response.status()} ${url}`);
  });
}
