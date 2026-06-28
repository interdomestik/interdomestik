import assert from 'node:assert/strict';
import test from 'node:test';

const { waitForPortalMarkerState } = require('./admin-checks-locators.ts');

class FakeLocator {
  page: FakePage;
  selector: string;

  constructor(page: FakePage, selector: string) {
    this.page = page;
    this.selector = selector;
  }

  async isVisible() {
    const match = this.selector.match(/\[data-testid="([^"]+)"\]/);
    return Boolean(match && this.page.visibleTestIds.has(match[1]));
  }

  async count() {
    if (this.selector.includes('admin-page-ready')) {
      this.page.adminMarkerReads += 1;
      return this.page.adminMarkerReads > 1 ? 1 : 0;
    }
    return (await this.isVisible()) ? 1 : 0;
  }
}

class FakeTestIdLocator {
  page: FakePage;
  testId: string;

  constructor(page: FakePage, testId: string) {
    this.page = page;
    this.testId = testId;
  }

  async isVisible() {
    return this.page.visibleTestIds.has(this.testId);
  }
}

class FakePage {
  visibleTestIds: Set<string>;
  adminMarkerReads: number;

  constructor(visibleTestIds: string[]) {
    this.visibleTestIds = new Set(visibleTestIds);
    this.adminMarkerReads = 0;
  }

  locator(selector: string) {
    return new FakeLocator(this, selector);
  }

  getByTestId(testId: string) {
    return new FakeTestIdLocator(this, testId);
  }
}

test('canonical portal marker wait requires the preferred marker snapshot', async () => {
  const page = new FakePage(['dashboard-page-ready']);

  const snapshot = await waitForPortalMarkerState(page, 'admin');

  assert.equal(snapshot.member, true);
  assert.equal(snapshot.admin, true);
  assert.ok(page.adminMarkerReads > 1);
});
