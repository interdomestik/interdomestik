import assert from 'node:assert/strict';
import test from 'node:test';

const { findRoleRowByText, removeRoleFromTable } = require('./admin-checks.ts');

class FakeButtonLocator {
  states: boolean[];
  checkCount: number;
  clickCount: number;

  constructor(states: boolean[]) {
    this.states = states;
    this.checkCount = 0;
    this.clickCount = 0;
  }

  first() {
    return this;
  }

  async isVisible() {
    return true;
  }

  async isEnabled() {
    const index = Math.min(this.checkCount, this.states.length - 1);
    const value = this.states[index];
    this.checkCount += 1;
    return value;
  }

  async click() {
    this.clickCount += 1;
  }
}

class FakeRowLocator {
  text: string;
  button: FakeButtonLocator;

  constructor(text: string, buttonStates = [true]) {
    this.text = text;
    this.button = new FakeButtonLocator(buttonStates);
  }

  async textContent() {
    return this.text;
  }

  getByRole(_role: string, _options?: unknown) {
    return this.button;
  }

  locator(selector: string) {
    if (selector !== 'button') {
      throw new Error(`Unexpected nested selector: ${selector}`);
    }
    return this.button;
  }
}

class FakeRowsLocator {
  rows: FakeRowLocator[];

  constructor(rows: FakeRowLocator[]) {
    this.rows = rows;
  }

  async count() {
    return this.rows.length;
  }

  nth(index: number) {
    return this.rows[index];
  }
}

class FakeTableLocator {
  rows: FakeRowLocator[];

  constructor(rows: FakeRowLocator[]) {
    this.rows = rows;
  }

  locator(selector: string) {
    if (selector !== 'tr') {
      throw new Error(`Unexpected selector: ${selector}`);
    }
    return new FakeRowsLocator(this.rows);
  }
}

class FakePage {
  table: FakeTableLocator;
  waits: number[];

  constructor(rows: FakeRowLocator[]) {
    this.table = new FakeTableLocator(rows);
    this.waits = [];
  }

  locator(selector: string) {
    if (selector !== '[data-testid="user-roles-table"]') {
      throw new Error(`Unexpected top-level selector: ${selector}`);
    }
    return this.table;
  }

  async waitForTimeout(ms: number) {
    this.waits.push(ms);
  }
}

test('findRoleRowByText matches a visible role row by text content', async () => {
  const promoterRow = new FakeRowLocator('PromoterTenant-wideRemove');
  const page = new FakePage([new FakeRowLocator('RoleBranchActions'), promoterRow]);

  const found = await findRoleRowByText(page, 'promoter');

  assert.equal(found, promoterRow);
});

test('removeRoleFromTable waits for the row action button to become enabled before clicking', async () => {
  const promoterRow = new FakeRowLocator('PromoterTenant-wideRemove', [false, false, true]);
  const page = new FakePage([new FakeRowLocator('RoleBranchActions'), promoterRow]);

  const removed = await removeRoleFromTable(page, 'promoter');

  assert.equal(removed, true);
  assert.equal(promoterRow.button.clickCount, 1);
  assert.deepEqual(page.waits, [300, 300, 800]);
});
