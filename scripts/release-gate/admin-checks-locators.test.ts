import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { waitForPortalMarkerState } = require('./admin-checks-locators.ts');
const {
  compactResponseBody,
  shouldCaptureResponseBody,
} = require('./admin-checks-response-capture.ts');

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

test('shouldCaptureResponseBody keeps mutation response details for actionable responses', () => {
  assert.equal(shouldCaptureResponseBody(200, 'text/x-component'), true);
  assert.equal(shouldCaptureResponseBody(200, 'application/json'), true);
  assert.equal(shouldCaptureResponseBody(500, 'text/html'), true);
  assert.equal(shouldCaptureResponseBody(200, 'text/html'), false);
});

test('compactResponseBody redacts common secret fields before evidence capture', () => {
  const body = compactResponseBody(
    '{"access_token":"abc123","refresh_token":"def456","ok":true} Authorization: Bearer xyz'
  );

  assert.match(body, /\[REDACTED\]/);
  assert.doesNotMatch(body, /abc123|def456|Bearer xyz/);
});
