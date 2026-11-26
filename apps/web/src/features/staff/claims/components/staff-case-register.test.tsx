// @vitest-environment node

import catalog from '@/messages/en/staff-correspondence.json';
import { authorizedSession } from '@/test/safe-action-harness';
import type { ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import { beforeEach, expect, it, vi } from 'vitest';
import { caseRegister } from './StaffClaimCaseRegister';

type RegisterNamespace = 'staff-correspondence.feedback' | 'staff-correspondence.summary';

const read = vi.hoisted(() => ({ staff: vi.fn(), summary: vi.fn() }));

vi.mock('@interdomestik/domain-claims/claims/inbound-upload', () => ({
  isInboundPilotCase: async () => false,
  readClaimUploadPaused: async () => false,
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));
vi.mock('@/actions/staff-claims/case-register-read', () => ({
  readStaffCaseRegister: read.staff,
  readBranchCorrespondenceSummary: read.summary,
}));

vi.mock('next-intl/server', async () => {
  const { createTranslator } = await vi.importActual<typeof import('next-intl')>('next-intl');
  return {
    getTranslations: ({ locale, namespace }: { locale: string; namespace: RegisterNamespace }) =>
      Promise.resolve(createTranslator({ locale, namespace, messages: catalog })),
  };
});

beforeEach(() => vi.resetAllMocks());

it('renders the branch manager total and ordered dates using only the summary read', async () => {
  const { session, authority } = authorizedSession({
    id: 'manager-a',
    tenantId: 'tenant-a',
    role: 'branch_manager',
    branchId: 'branch-a',
  });
  const dates = ['2026-01-03T08:15:00.000Z', '2026-01-04T11:15:00.000Z'];
  read.summary.mockResolvedValue({
    ok: true,
    summary: { total: 2, dates },
    entries: [{ body: 'Unexposed correspondence content' }],
  });
  const view = await caseRegister(
    session,
    authority,
    { id: 'claim-a', staffId: 'staff-a' },
    [{ id: 'doc-a', name: 'Unexposed document.pdf' }],
    'en'
  );
  const stream = await renderToReadableStream(view);
  await stream.allReady;
  const html = await new Response(stream).text();

  expect(read.summary).toHaveBeenCalledExactlyOnceWith(session, authority, 'claim-a');
  expect(read.staff).not.toHaveBeenCalled();
  expect(html).toContain('Correspondence entries • 2');
  expect(html).toMatch(/01\/03\/2026 09:15.*01\/04\/2026 12:15/s);
  expect(html).not.toContain('Unexposed');
  expect(html).not.toContain('<form');
});

it('says how many of the summary dates it shows when the register is longer', async () => {
  const { session, authority } = authorizedSession({
    id: 'manager-a',
    tenantId: 'tenant-a',
    role: 'branch_manager',
    branchId: 'branch-a',
  });
  read.summary.mockResolvedValue({
    ok: true,
    summary: { total: 75, dates: Array.from({ length: 50 }, () => '2026-01-03T08:15:00.000Z') },
  });
  const view = await caseRegister(session, authority, { id: 'claim-a', staffId: null }, [], 'en');
  const stream = await renderToReadableStream(view);
  await stream.allReady;
  expect(await new Response(stream).text()).toContain('Showing the latest dates: 50 of 75');
});

it('reads the requested correspondence page for staff', async () => {
  const { session, authority } = authorizedSession({
    id: 'staff-a',
    tenantId: 'tenant-a',
    role: 'staff',
  });
  const failed = { ok: false, code: 'INTERNAL_SERVER_ERROR' };
  read.staff.mockResolvedValue([failed, failed, failed, { ok: true, documents: [] }]);
  const view = await caseRegister(
    session,
    authority,
    { id: 'claim-a', staffId: 'staff-a' },
    [],
    'en',
    2
  );
  const stream = await renderToReadableStream(view);
  await stream.allReady;
  expect(read.staff).toHaveBeenCalledExactlyOnceWith(session, authority, 'claim-a', 2);
});
