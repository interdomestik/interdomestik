import { expect, type Locator } from '@playwright/test';

/** Reveal options without consenting to storage or starting a save. Recovery offers own the page. */
export async function openSaveArea(flow: Locator) {
  const offer = flow.getByTestId('anonymous-draft-recovery-offer');
  const opener = flow.getByTestId('free-start-save-entry-open');
  const band = flow.getByTestId('free-start-secure-save-band');
  await expect(offer.or(opener).or(band).first()).toBeVisible();
  if (await offer.isVisible()) return;
  if (await opener.isVisible()) await opener.click();
  await expect(band).toBeVisible();
}

/** Reveal device-specific facts; the separate enable button remains the consent boundary. */
export async function openDeviceDetails(flow: Locator) {
  const opener = flow.getByTestId('browser-recovery-details-open');
  await expect(opener).toBeVisible();
  if ((await opener.getAttribute('aria-expanded')) !== 'true') await opener.click();
  await expect(flow.getByTestId('browser-recovery-enable')).toBeVisible();
}
