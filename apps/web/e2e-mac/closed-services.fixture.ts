import { test as base } from '../e2e/fixtures/auth.fixture';

export { expect } from '@playwright/test';

export const CLOSED_SERVICES_PROJECT = 'closed-services-ks';

export const test = base.extend<{ closedServices: void }>({
  closedServices: [
    async ({}, use, info) => {
      if (info.project.name === CLOSED_SERVICES_PROJECT) {
        const { assertClosedServices } = await import('./closed-services.setup.fixture');
        await assertClosedServices();
      }
      await use();
    },
    { auto: true },
  ],
});
