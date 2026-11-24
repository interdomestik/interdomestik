// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { validateEntry } from './member-acceptance-entry-rules.test-support';
import { guardModule, loadInventory, web } from './member-acceptance-inventory.test-support';

const actionFile = 'actions/fixture.ts';
const guard = 'const guardedRead = guard(async (input: unknown) => input);';
const delegate = 'export async function read(...args: unknown[]) { return guardedRead(...args); }';

function checkAction(source: string, reexport = false) {
  const directory = mkdtempSync(path.join(tmpdir(), 'acceptance-delegate-'));
  function write(file: string, code: string) {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, code);
  }
  try {
    write(guardModule, 'export const memberGuarded = (handler: unknown) => handler;');
    write(
      web + actionFile,
      `'use server';
       import { memberGuarded as guard } from '@/lib/privacy/require-member-acceptance';
       ${source}`
    );
    if (reexport) {
      write(
        web + 'actions/public.ts',
        "'use server'; import { read } from './fixture'; export { read };"
      );
    }
    const inventory = loadInventory(directory, []);
    const entries = inventory.units.filter(unit => unit.id.endsWith('#read'));
    expect(entries).toHaveLength(reexport ? 2 : 1);
    for (const unit of entries) {
      validateEntry(inventory, unit, { disposition: 'checked', via: 'memberGuarded' });
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

it('accepts a symbol-resolved delegate through an action re-export', () => {
  expect(() => checkAction(`${guard} ${delegate}`, true)).not.toThrow();
});

it('accepts an awaited delegate that forwards its parameters in order', () => {
  expect(() =>
    checkAction(`${guard}
      export async function read(input: unknown, extra?: unknown) {
        return await guardedRead(input, extra);
      }`)
  ).not.toThrow();
});

it.each([
  [
    'different arguments',
    `${guard} export async function read(input: unknown) { return guardedRead('other'); }`,
  ],
  [
    'reordered arguments',
    `${guard} export async function read(a: unknown, b: unknown) { return guardedRead(b, a); }`,
  ],
  [
    'an extra statement',
    `${guard} export async function read(input: unknown) { work(); return guardedRead(input); }`,
  ],
  ['an unrelated initializer', `const guardedRead = () => 'other'; ${delegate}`],
  [
    'an aliased initializer',
    `const factory = guard; const guardedRead = factory(work); ${delegate}`,
  ],
  ['a mutable wrapper', `let guardedRead = guard(work); ${delegate}`],
  ['an exported wrapper', `export ${guard} ${delegate}`],
  ['a wrapper exported under an alias', `${guard} export { guardedRead as other }; ${delegate}`],
  [
    'a shadowed name',
    `${guard} export async function read(guardedRead: (value: unknown) => unknown) {
      return guardedRead(guardedRead);
    }`,
  ],
  ['a nested wrapper', 'export async function read(input: unknown) { return guard(work)(input); }'],
  ['a wrapper value export', 'export const read = guard(async () => null);'],
])('rejects %s', (_label, code) => {
  expect(() => checkAction(code)).toThrow(/expected direct memberGuarded export/u);
});
