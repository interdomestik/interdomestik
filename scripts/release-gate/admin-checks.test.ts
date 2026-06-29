import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { removeRoleFromTable } = require('./admin-checks.ts');

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

  async waitFor() {}

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

  filter(options: { hasText: RegExp }) {
    const row = this.rows.find(candidate => options.hasText.test(candidate.text));
    return {
      first: () => {
        if (!row) {
          return {
            waitFor: async () => {
              throw new Error('row not found');
            },
            getByRole: () => new FakeButtonLocator([false]),
            locator: () => new FakeButtonLocator([false]),
          };
        }
        return row;
      },
    };
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

  constructor(rows: FakeRowLocator[]) {
    this.table = new FakeTableLocator(rows);
  }

  locator(selector: string) {
    if (selector !== '[data-testid="user-roles-table"]') {
      throw new Error(`Unexpected top-level selector: ${selector}`);
    }
    return this.table;
  }
}

test('removeRoleFromTable clicks the visible role row action', async () => {
  const promoterRow = new FakeRowLocator('PromoterTenant-wideRemove');
  const page = new FakePage([new FakeRowLocator('RoleBranchActions'), promoterRow]);

  const removed = await removeRoleFromTable(page, 'promoter');

  assert.equal(removed, true);
  assert.equal(promoterRow.button.clickCount, 1);
});
