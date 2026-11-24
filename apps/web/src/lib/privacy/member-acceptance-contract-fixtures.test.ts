// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  roleEvidenceProof,
  validateEntry,
  validateEntryCoverage,
} from './member-acceptance-entry-rules.test-support';
import {
  guardModule,
  loadInventory,
  member,
  web,
} from './member-acceptance-inventory.test-support';
import { verifyInformationRequestCallSites } from './member-acceptance-page-readers.test-support';

let dir: string;
function write(file: string, code: string) {
  const target = path.join(dir, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, code);
}

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'acceptance-contract-'));
  write(
    guardModule,
    `
    export const withMemberAcceptance = (handler: unknown) => handler;
    export const memberGuarded = withMemberAcceptance;
    export const requireAdmittedMember = () => input;
    export const requireMemberAcceptancePage = requireAdmittedMember;
  `
  );
});
afterEach(() => rmSync(dir, { force: true, recursive: true }));

describe('fail-closed acceptance inventory fixtures', () => {
  it.each(['layout.tsx', 'template.tsx', 'default.tsx', '@case/card.tsx'])(
    'discovers an unlisted member %s',
    file => {
      write(web + member + file, 'export default function Entry() { return null; }');
      const ids = loadInventory(dir, []).units.map(unit => unit.id);
      expect(() => validateEntryCoverage(ids, {})).toThrow(`Missing disposition: ${member}${file}`);
    }
  );

  it('rejects a stale row', () => {
    expect(() =>
      validateEntryCoverage([], {
        'gone.ts#GET': { disposition: 'exempt', reason: 'Public health check' },
      })
    ).toThrow('Stale disposition: gone.ts#GET');
  });

  it.each([
    "export { POST } from './absent';",
    "export * from './absent';",
    "import './absent'; export function POST() {}",
  ])('refuses an unresolved module path in %s', code => {
    write(web + 'app/api/fixture/route.ts', code);
    expect(() => loadInventory(dir, [])).toThrow(/Unresolved (?:export|import or re-export)/u);
  });

  it.each([
    ['app/api/fixture/route.ts', 'export function GET() {}', 'withMemberAcceptance'],
    ['actions/fixture.ts', "'use server'; export function read() {}", 'memberGuarded'],
  ])('requires a direct wrapper at %s', (file, code, via) => {
    write(web + file, code);
    const inventory = loadInventory(dir, []);
    expect(() =>
      validateEntry(inventory, inventory.units[0], { disposition: 'checked', via })
    ).toThrow(`expected direct ${via} export`);
  });

  it.each([
    'export const wrapped = check(async () => new Response());',
    `const guardedRead = check(async () => new Response());
     export async function wrapped(request: Request) { return guardedRead(request); }`,
  ])('resolves a named route re-export and an aliased wrapper import in %s', declaration => {
    write(web + 'app/api/fixture/route.ts', "export { wrapped as GET } from './core';");
    write(
      web + 'app/api/fixture/core.ts',
      `
      import { withMemberAcceptance as check } from '@/lib/privacy/require-member-acceptance';
      ${declaration}
    `
    );
    const inventory = loadInventory(dir, []);
    expect(() =>
      validateEntry(inventory, inventory.units[0], {
        disposition: 'checked',
        via: 'withMemberAcceptance',
      })
    ).not.toThrow();
  });

  it.each(['exempt', 'defect_reported', 'deferred_13a2'])(
    'rejects an unsupported %s declaration',
    disposition => {
      write(web + 'app/api/fixture/route.ts', 'export function POST() {}');
      const inventory = loadInventory(dir, []);
      expect(() => validateEntry(inventory, inventory.units[0], { disposition })).toThrow();
    }
  );

  it('invalidates a reviewed role denial if a protected read moves ahead of it', () => {
    const file = web + 'app/api/fixture/route.ts';
    const evidence = `${file}:2`;
    const checked = 'if (role !== "staff") return forbidden();';
    write(file, `export function GET() {\n${checked}\nreturn privateRead();\n}`);
    const reviewed = loadInventory(dir, []);
    const proof = roleEvidenceProof(reviewed, reviewed.units[0], evidence);

    write(file, `export function GET() { privateRead();\n${checked}\nreturn response();\n}`);
    const changed = loadInventory(dir, []);
    expect(() =>
      validateEntry(changed, changed.units[0], {
        disposition: 'not_member_reachable',
        evidence,
        proof,
      })
    ).toThrow('reviewed role denial changed');
  });

  it('rejects an alternate session source at a chokepoint entry', () => {
    write(web + 'lib/auth/index.ts', 'export const auth = { api: { getSession() {} } };');
    write(web + 'actions/context.ts', 'export function getContext() {}');
    write(
      web + 'actions/fixture.ts',
      `
      'use server';
      import { auth } from '@/lib/auth';
      import { getContext } from './context';
      export function read() { getContext(); return auth.api.getSession(); }
    `
    );
    const inventory = loadInventory(dir, []);
    expect(() =>
      validateEntry(inventory, inventory.units[0], {
        disposition: 'checked',
        via: 'actions/context.ts#getContext',
      })
    ).toThrow(/other authority (?:or session )?source/u);
  });

  it.each(['page.tsx', 'layout.tsx', '_core.ts'])('rejects a session import from %s', file => {
    write(web + 'lib/auth/index.ts', 'export const auth = { api: { getSession() {} } };');
    const template = `
      import { auth as alternate } from '@/lib/auth';
      import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';
      export default function entry() { requireAdmittedMember(); return alternate.api.getSession(); }
    `;
    write(web + member + file, template);
    const inventory = loadInventory(dir, file.endsWith('.ts') ? [`${member}${file}#default`] : []);
    expect(() =>
      validateEntry(inventory, inventory.units[0], {
        disposition: 'checked',
        via: file.endsWith('.ts') ? 'requireAdmittedMember' : 'requireMemberAcceptancePage',
      })
    ).toThrow(/other authority (?:or session )?source/u);
  });

  it.each([
    ['(authority: TenantAuthority) { return requireAdmittedMember(); }', 'takes authority'],
    ['() { return resolveOtherAuthority(); }', 'lacks requireAdmittedMember'],
  ])('refuses a protected loader with %s', (body, error) => {
    const id = `${member}_core.ts#load`;
    write(
      web + member + '_core.ts',
      `
      import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';
      export function load${body}
    `
    );
    const inventory = loadInventory(dir, [id]);
    expect(() =>
      validateEntry(inventory, inventory.units[0], {
        disposition: 'checked',
        via: 'requireAdmittedMember',
      })
    ).toThrow(error);
  });

  it.each([
    [
      'a sibling loader',
      'return [await safe(), await unguarded()];',
      'return read(previousRequest);',
    ],
    ['a downstream loader', 'return safe();', 'return read(previousRequest);'],
    ['a domain call with another authority', 'return safe();', 'return read(previousRequest);'],
  ])('rejects %s even alongside a checked reader', (_label, pageBody, badBody) => {
    const page = web + member + 'page.tsx';
    const domain = 'packages/domain-fixture/src/reader.ts';
    const readerPath = path.posix.relative(path.posix.dirname(page), domain).slice(0, -3);
    const downstream = _label === 'a downstream loader';
    const inline = _label === 'a domain call with another authority';
    const otherCall = downstream ? ', unguarded()' : '';
    const safeBody = inline
      ? 'await read(authority); ' + badBody
      : `return [read(authority)${otherCall}];`;
    write(domain, 'export function read(authority: TenantAuthority) { return authority; }');
    write(
      page,
      `
      import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';
      import { read } from '${readerPath}';
      export default async function Page() { ${pageBody} }
      async function safe() {
        const admission = await requireAdmittedMember();
        if (!admission.ok) return null;
        const { authority } = admission.authorized;
        ${safeBody}
      }
      function unguarded() { ${badBody} }
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

  it('refuses an imported callback that calls a protected reader', () => {
    const page = web + member + 'page.tsx';
    const domain = 'packages/domain-claims/src/claims/information-requests.ts';
    const readerPath = path.posix.relative(path.posix.dirname(page), domain).slice(0, -3);
    write(
      domain,
      'export function getInformationRequests(_session: unknown, _authority: TenantAuthority) {}'
    );
    write(
      web + member + 'loader.ts',
      `
      import { getInformationRequests } from '${readerPath}';
      import { requireAdmittedMember } from '@/lib/privacy/require-member-acceptance';
      export async function load() {
        const admission = await requireAdmittedMember();
        if (!admission.ok) return null;
        const { session, authority } = admission.authorized;
        return getInformationRequests(session, authority);
      }
    `
    );
    write(
      page,
      `
      import { load } from './loader';
      export default function Page() {
        return run(load);
      }
    `
    );
    const inventory = loadInventory(dir, []);
    expect(() => verifyInformationRequestCallSites(inventory)).toThrow(
      'Unproven protected reader:'
    );
    expect(() =>
      validateEntry(inventory, inventory.units[0], {
        disposition: 'checked',
        via: 'requireMemberAcceptancePage',
      })
    ).toThrow('Unproven protected reader:');
  });

  it('discovers an exported member core reader even before a page calls it', () => {
    const id = `${member}_core.ts#load`;
    write(web + 'lib/tenant-client.ts', 'export function withTenantAuthority() {}');
    write(
      web + member + '_core.ts',
      `
      import { withTenantAuthority } from '@/lib/tenant-client';
      export function load() { return withTenantAuthority(); }
    `
    );
    const inventory = loadInventory(dir, []);
    expect(inventory.units.map(unit => unit.id)).toEqual([id]);
    expect(() =>
      validateEntry(inventory, inventory.units[0], {
        disposition: 'checked',
        via: 'requireAdmittedMember',
      })
    ).toThrow('protected loader lacks requireAdmittedMember');
  });
});
