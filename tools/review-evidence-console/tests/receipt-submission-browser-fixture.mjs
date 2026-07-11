const itemIds = [
  'M03A-PRIVACY-OWNER',
  'M03A-MEDICAL-BOUNDARY',
  'M03A-CONSENT-FIELDS',
  'M03A-ACCESS-ROLES',
];

export async function installDirectoryScenario(page, scenario = 'success') {
  await page.addInitScript(value => {
    globalThis.directoryProbe = {
      clickTrusted: null,
      dispatchActive: false,
      pickerCalls: 0,
      pickerDuringClick: null,
      userActivationActive: null,
      writes: [],
    };
    addEventListener(
      'click',
      event => {
        if (!event.target?.textContent?.includes('Dërgo shqyrtimin')) return;
        globalThis.directoryProbe.clickTrusted = event.isTrusted;
        globalThis.directoryProbe.dispatchActive = true;
      },
      true
    );
    addEventListener('click', () => {
      globalThis.directoryProbe.dispatchActive = false;
    });
    if (value === 'unsupported') {
      globalThis.showDirectoryPicker = undefined;
      return;
    }
    globalThis.showDirectoryPicker = options => {
      const probe = globalThis.directoryProbe;
      probe.pickerCalls += 1;
      probe.pickerDuringClick = probe.dispatchActive;
      probe.userActivationActive = navigator.userActivation?.isActive === true;
      if (!probe.pickerDuringClick) throw new Error('picker invoked after trusted click dispatch');
      if (value === 'cancelled') return Promise.reject(new DOMException('cancelled', 'AbortError'));
      if (value === 'denied') return Promise.reject(new DOMException('denied', 'NotAllowedError'));
      return Promise.resolve({
        async getFileHandle(name, fileOptions) {
          return {
            async createWritable() {
              return {
                async write(text) {
                  if (value === 'write_failed') throw new Error('disk');
                  probe.writes.push({ name, fileOptions, options, text });
                },
                async close() {},
              };
            },
          };
        },
      });
    };
  }, scenario);
}

async function fillRequired(page) {
  const fields = page.locator('.decision-form input[required], .decision-form textarea[required]');
  for (let index = 0; index < (await fields.count()); index += 1) {
    const field = fields.nth(index);
    const type = await field.getAttribute('type');
    if (['radio', 'checkbox'].includes(type) || (await field.inputValue())) continue;
    const id = await field.getAttribute('id');
    await field.fill(
      type === 'date'
        ? '2026-07-10'
        : id?.toLowerCase().includes('ref')
          ? 'docs/final-review.md'
          : 'Vlerë finale e shqyrtuesit'
    );
  }
}

export async function submitCompleteReview(page, origin) {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Vazhdo paketën' }).click();
  for (const itemId of itemIds) {
    if (!decodeURIComponent(new URL(page.url()).hash).endsWith(`/${itemId}`)) {
      await page.locator(`[data-item-id="${itemId}"]`).click();
    }
    await page.locator('.decision-form input[type="radio"][value="approve"]').check();
    await fillRequired(page);
  }
  await page.locator('#safe-evidence-confirmed').check();
  await page.getByRole('button', { name: 'Shqyrto dhe dërgo' }).click();
  await page.getByRole('button', { name: 'Dërgo shqyrtimin' }).click();
}

export async function submissionArtifacts(page) {
  return page.evaluate(() => {
    const receiptKey = Object.keys(localStorage).find(key =>
      key.startsWith('review-console:v1:receipt:')
    );
    return {
      probe: globalThis.directoryProbe,
      receipt: receiptKey ? JSON.parse(localStorage.getItem(receiptKey)) : null,
    };
  });
}
