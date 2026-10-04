import { expect, test, type TestInfo } from '@playwright/test';

import en from '../../src/messages/en/freeStart.json';
import sq from '../../src/messages/sq/freeStart.json';
import mk from '../../src/messages/mk/freeStart.json';
import sr from '../../src/messages/sr/freeStart.json';

const KEY = 'interdomestik_free_start_recovery_v1';
const catalogs = { en, sq, mk, sr };

function recoveryOrigin(info: TestInfo) {
  const configured = process.env.IDA_RECOVERY_ORIGIN?.trim() || process.env.IDA_HOST?.trim();
  if (!configured) throw new Error('The configured neutral recovery host is required.');
  const target = new URL(configured.includes('://') ? configured : `http://${configured}`);
  if (!process.env.IDA_RECOVERY_ORIGIN && target.hostname === 'ida.127.0.0.1.nip.io') {
    target.hostname = 'ida.localhost';
  }
  expect(target.port).toBe(new URL(String(info.project.use.baseURL)).port);
  return target.origin;
}

for (const locale of ['en', 'sq', 'mk', 'sr'] as const) {
  for (const category of ['vehicle', 'property'] as const) {
    test(`${locale} ${category} entry exposes both recovery decisions at 390×844`, async ({
      browser,
    }, info) => {
      const origin = recoveryOrigin(info);
      const context = await browser.newContext({
        baseURL: origin,
        extraHTTPHeaders: {},
        ignoreHTTPSErrors: Boolean(info.project.use.ignoreHTTPSErrors),
        storageState: undefined,
        viewport: { width: 390, height: 844 },
      });
      const now = Date.now();
      const raw = JSON.stringify({
        version: 1,
        draft: {
          category,
          issueType: category === 'vehicle' ? 'parking_damage' : 'water_damage',
          desiredOutcome: 'repair',
          resumeStep: 'details',
          summary: category === 'vehicle' ? 'A parked vehicle was scratched.' : 'A tap leaked.',
        },
        updatedAt: new Date(now).toISOString(),
        expiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString(),
      });
      try {
        await context.addInitScript(
          ({ key, raw, origin }) => {
            if (location.origin === origin) localStorage.setItem(key, raw);
          },
          { key: KEY, raw, origin }
        );
        const page = await context.newPage();
        const response = await page.goto(`/${locale}`);
        expect([200, 304]).toContain(response?.status());
        expect(await page.evaluate(() => isSecureContext && Boolean(navigator.locks))).toBe(true);
        const organizer = page.getByTestId('premium-free-start-organizer');
        const offer = organizer.getByTestId('anonymous-draft-recovery-offer');
        await expect(offer).toHaveAttribute('aria-busy', 'false');
        const hero = page.getByTestId(`public-entry-${category}`);
        await expect(hero).toHaveAttribute('data-public-entry-ready', 'true');
        // This ordinary preference is separate from the single situation activation.
        await page.getByTestId('cookie-consent-decline').click();
        await expect(page.getByTestId('cookie-consent-banner')).toHaveCount(0);
        await page.evaluate(async () => {
          await document.fonts.ready;
        });
        await hero.click();

        const copy = catalogs[locale].freeStart;
        const recovery = JSON.parse(copy.secureSave).recovery as {
          body: string;
          offerBody: string;
          offerHeading: string;
          privateDevice: string;
          continue: string;
          discard: string;
        };
        const heading = offer.getByRole('heading', { name: recovery.offerHeading, exact: true });
        await expect(heading).toBeFocused();
        await page.evaluate(
          () =>
            new Promise<void>(resolve =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
            )
        );
        await expect(heading).toBeInViewport({ ratio: 1 });
        const headerBottom = await page
          .getByTestId('public-header')
          .evaluate(element => element.getBoundingClientRect().bottom);
        expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(headerBottom);
        const paragraphs = offer.locator('p');
        const expectedCopy = [
          recovery.body,
          recovery.offerBody,
          copy.localRecoveryDisclosure.eligible,
          copy.localRecoveryDisclosure.lifecycle,
          copy.localRecoveryDisclosure.securePath,
          recovery.privateDevice,
        ];
        const actualCopy = await paragraphs.allTextContents();
        let previous = -1;
        for (const text of expectedCopy) {
          const position = actualCopy.indexOf(text);
          expect(position).toBeGreaterThan(previous);
          previous = position;
        }
        for (const label of [recovery.continue, recovery.discard]) {
          const button = offer.getByRole('button', { name: label, exact: true });
          await expect(button).toBeEnabled();
          await expect(button).toBeInViewport({ ratio: 1 });
          const geometry = await button.evaluate(element => {
            const rect = element.getBoundingClientRect();
            const header = document.querySelector('[data-testid="public-header"]');
            return {
              height: rect.height,
              unobscured:
                Math.min(innerHeight, rect.bottom) -
                Math.max(rect.top, header?.getBoundingClientRect().bottom ?? 0),
              disclosuresBefore: [...element.closest('section')!.querySelectorAll('p')]
                .filter(node => !node.classList.contains('sr-only'))
                .every(node =>
                  Boolean(node.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING)
                ),
            };
          });
          expect(geometry.height).toBeGreaterThanOrEqual(48);
          expect(geometry.unobscured).toBeGreaterThanOrEqual(44);
          expect(geometry.disclosuresBefore).toBe(true);
        }
        await expect(offer).toHaveAttribute('aria-busy', 'false');
        await expect(organizer.getByTestId('free-start-recovery-editor')).toHaveAttribute(
          'inert',
          ''
        );
        expect(await page.evaluate(key => localStorage.getItem(key), KEY)).toBe(raw);
      } finally {
        await context.close();
      }
    });
  }
}
