import type { Page } from '@playwright/test';

export async function initializeConsent(page: Page): Promise<void> {
  // Run before application scripts on every subsequent navigation.
  await page.addInitScript(() => {
    localStorage.setItem('interdomestik_cookie_consent_v1', 'necessary');
    document.cookie = 'cookie_consent=necessary; Path=/; SameSite=Lax';
  });
}
