// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validateEntry } from './member-acceptance-entry-rules.test-support';
import {
  guardModule,
  loadInventory,
  member,
  web,
} from './member-acceptance-inventory.test-support';
import { verifyInformationRequestCallSites } from './member-acceptance-page-readers.test-support';

import { named, refusedReaderCases } from './member-acceptance-reader-cases.test-support';

let dir: string;
function write(file: string, code: string) {
  const target = path.join(dir, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, code);
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'acceptance-readers-'));
  write(guardModule, 'export const requireAdmittedMember = () => input;');
});
afterEach(() => rmSync(dir, { force: true, recursive: true }));

const fixturePage = web + member + 'page.tsx';
const fixtureReader = 'packages/domain-claims/src/claims/information-requests.ts';
describe('fail-closed acceptance reader fixtures', () => {
  it.each([
    ['arrow', 'export const read = (authority: TenantAuthority) => authority;', 'read'],
    [
      'function expression',
      'export const read = function (authority: TenantAuthority) { return authority; };',
      'read',
    ],
  ])('refuses a protected %s call with another authority', (_label, declaration, callee) => {
    const page = web + member + 'page.tsx';
    const domain = 'packages/domain-fixture/src/reader.ts';
    const readerPath = path.posix.relative(path.posix.dirname(page), domain).slice(0, -3);
    write(domain, declaration);
    write(
      page,
      `
      import { read } from '${readerPath}';
      import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';
      export default async function Page() {
        const admission = await requireAdmittedMember();
        if (!admission.ok) return null;
        const { authority } = admission.authorized;
        await read(authority);
        return ${callee}(previousRequest);
      }
    `
    );
    const inventory = loadInventory(dir, []);
    expect(() =>
      validateEntry(inventory, inventory.units[0], {
        disposition: 'checked',
        via: 'requireMemberAcceptancePage',
      })
    ).toThrow('lacks same-request admitted authority');
  });

  it.each([
    'q.authority = previousRequest;',
    'const alias = q; alias["authority"] = previousRequest;',
    'updateHolder(q);',
  ])('refuses authority carried by an object that may be changed by %s', mutation => {
    const page = web + member + 'page.tsx';
    const domain = 'packages/domain-fixture/src/reader.ts';
    const readerPath = path.posix.relative(path.posix.dirname(page), domain).slice(0, -3);
    write(domain, 'export function read(query: { authority: TenantAuthority }) { return query; }');
    write(
      page,
      `
      import { read } from '${readerPath}';
      import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';
      function updateHolder(holder: { authority: unknown }) { holder.authority = previousRequest; }
      export default async function Page() {
        const admission = await requireAdmittedMember();
        if (!admission.ok) return null;
        const { authority } = admission.authorized;
        await read({ authority });
        const q = { authority };
        ${mutation}
        return read(q);
      }
    `
    );
    const inventory = loadInventory(dir, []);
    expect(() =>
      validateEntry(inventory, inventory.units[0], {
        disposition: 'checked',
        via: 'requireMemberAcceptancePage',
      })
    ).toThrow('lacks same-request admitted authority');
  });

  it.each([
    [
      'named import',
      '',
      'import { getInformationRequests } from "READER";',
      'getInformationRequests',
    ],
    [
      'named re-export',
      'export { getInformationRequests } from "READER";',
      'import { getInformationRequests } from "./barrel";',
      'getInformationRequests',
    ],
    [
      'same-name re-export of a named import',
      'import { getInformationRequests } from "READER"; export { getInformationRequests };',
      'import { getInformationRequests } from "./barrel";',
      'getInformationRequests',
    ],
    [
      'namespace member',
      '',
      'import * as readers from "READER";',
      'readers.getInformationRequests',
    ],
  ])('checks the authority of an allowed %s', (_label, barrel, imports, callee) => {
    const inventory = fixture(barrel, imports, `return ${callee}(session, authority);`);
    expect(() => verifyInformationRequestCallSites(inventory)).not.toThrow();
    expect(() => checkPage(inventory)).not.toThrow();
    const wrong = fixture(barrel, imports, `return ${callee}(session, previousRequest);`);
    expect(() => verifyInformationRequestCallSites(wrong)).toThrow(
      'lacks same-request admitted authority'
    );
    expect(() => checkPage(wrong)).toThrow('lacks same-request admitted authority');
  });

  it('accepts a transaction opened through the tenant-context namespace', () => {
    expect(() =>
      checkPage(transactionFixture('@interdomestik/database/tenant-authority-context'))
    ).not.toThrow();
  });

  it('refuses a transaction opened by a same-named export from another namespace', () => {
    expect(() => checkPage(transactionFixture('./other-context'))).toThrow(
      'callback containing a reader call'
    );
  });

  it.each(refusedReaderCases)(
    'refuses %s even with the admitted authority',
    (_label, barrel, imports, body) => {
      const inventory = fixture(barrel, imports, body);
      expect(() => verifyInformationRequestCallSites(inventory)).toThrow(
        'Unproven protected reader:'
      );
      expect(() => checkPage(inventory)).toThrow('Unproven protected reader:');
    }
  );

  it('keeps an unrelated shadowed reader name separate from the protected call', () => {
    const inventory = fixture(
      '',
      named,
      `{
        function getInformationRequests() { return []; }
        await getInformationRequests();
      }
      return getInformationRequests(session, authority);`
    );
    expect(() => verifyInformationRequestCallSites(inventory)).not.toThrow();
    expect(() => checkPage(inventory)).not.toThrow();
  });

  it('refuses a loop binding that shadows the admitted authority', () => {
    const inventory = fixture(
      '',
      named,
      'for (const authority of [previousRequest]) return getInformationRequests(session, authority);'
    );
    expect(() => verifyInformationRequestCallSites(inventory)).toThrow(
      'lacks same-request admitted authority'
    );
    expect(() => checkPage(inventory)).toThrow('lacks same-request admitted authority');
  });

  it('refuses a typed callback beside a guarded read', () => {
    const inventory = fixture(
      '',
      named,
      `
      await getInformationRequests(session, authority);
      const read = () => getInformationRequests(session, previousRequest);
      function invoke(callback: () => unknown) { return callback(); }
      return invoke(read);
    `
    );
    expect(() => verifyInformationRequestCallSites(inventory)).toThrow(
      'Unproven protected reader:'
    );
    expect(() => checkPage(inventory)).toThrow('Unproven protected reader:');
  });

  it('refuses a renamed barrel backed by a destructured namespace', () => {
    const inventory = fixture(
      `import * as readers from "READER";
       export const { getInformationRequests } = readers;`,
      'import { read } from "./renamed";',
      'return read(session, authority);',
      'export { getInformationRequests as read } from "./barrel";'
    );
    expect(() => verifyInformationRequestCallSites(inventory)).toThrow(
      'Unproven protected reader:'
    );
    expect(() => checkPage(inventory)).toThrow('Unproven protected reader:');
  });
});

function transactionFixture(context: string) {
  const transaction = 'export function withTenantAuthority(authority, run) { return run(tx); }';
  write(
    'packages/database/package.json',
    JSON.stringify({
      exports: { './tenant-authority-context': './src/tenant-authority-context.ts' },
    })
  );
  write('packages/database/src/tenant-authority-context.ts', transaction);
  write(web + member + 'other-context.ts', transaction);
  const reader = 'packages/domain-fixture/src/transaction-reader.ts';
  const from = path.posix.relative(path.posix.dirname(fixturePage), reader).slice(0, -3);
  write(reader, 'export function read(tx: TenantTransaction) { return tx; }');
  return fixture(
    '',
    `import * as ns from '${context}'; import { read } from '${from}';`,
    'return ns.withTenantAuthority(authority, tx => read(tx));'
  );
}

function fixture(barrel: string, imports: string, body: string, renamed?: string) {
  const from = path.posix.relative(path.posix.dirname(fixturePage), fixtureReader).slice(0, -3);
  write(
    fixtureReader,
    'export function getInformationRequests(session: unknown, authority: TenantAuthority) {}'
  );
  write(web + member + 'barrel.ts', barrel.replaceAll('READER', from));
  if (renamed) write(web + member + 'renamed.ts', renamed);
  write(
    fixturePage,
    `
    ${imports.replaceAll('READER', from)}
    import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';
    export default async function Page() {
      const admission = await requireAdmittedMember();
      if (!admission.ok) return null;
      const { session, authority } = admission.authorized;
      ${body.replaceAll('READER', from)}
    }
  `
  );
  return loadInventory(dir, []);
}
function checkPage(inventory: ReturnType<typeof loadInventory>) {
  validateEntry(inventory, inventory.units[0], {
    disposition: 'checked',
    via: 'requireMemberAcceptancePage',
  });
}
