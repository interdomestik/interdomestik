import {
  and,
  branches,
  claimDocuments,
  claims,
  E2E_USER_IDS,
  eq,
  inArray,
  user,
} from '@interdomestik/database';
import { drizzle } from 'drizzle-orm/postgres-js';
import { randomUUID } from 'node:crypto';
import { expect, loginAtDoor, test } from '../fixtures/one-door.fixture';
import { gotoApp } from '../utils/navigation';
import {
  documentId,
  runRestrictedClaimReader,
  type ClaimReadFixture,
} from './test/admin-claim-detail-plans';

const home = 'tenant_ks';
const access = 'tenant_mk';
const RUNTIME_ROLE_MODULE: string = '../../../../scripts/e2e-runtime-role.mjs';

const pagingTest = test.extend<{
  claimFixture: ClaimReadFixture & { staff: { id: string; name: string; email: string }[] };
}>({
  claimFixture: async ({}, use, info) => {
    test.skip(info.project.name !== 'gate-ks-sq', 'Runs both tenants at the door from the KS gate');
    const prefix = process.env.WP19_EXPLAIN === '1' ? 'wp19-plan-fixture' : `wp19-${randomUUID()}`;
    const localId = `${prefix}-local`;
    const transferredId = `${prefix}-transferred`;
    const wrongBranchId = `${prefix}-wrong-branch`;
    const ids = [localId, transferredId, wrongBranchId];
    const now = new Date();
    const staff = Array.from({ length: 28 }, (_, index) => {
      const suffix = String(index).padStart(2, '0');
      return {
        id: `${prefix}-staff-${suffix}`,
        tenantId: index === 27 ? access : home,
        role: index === 26 ? 'agent' : 'staff',
        name: `${prefix} Staff ${suffix}`,
        email: `${prefix}-staff-${suffix}@example.test`,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      };
    });
    // The guarded role script is native ESM and Playwright loads this spec as CommonJS.
    const { openGuardedClient } = (await import(
      RUNTIME_ROLE_MODULE
    )) as typeof import('../../../../scripts/e2e-runtime-role.mjs');
    const client: typeof import('@interdomestik/database/db').dbRls.$client =
      await openGuardedClient(
        process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL ?? '',
        'wp19_browser_fixture'
      );
    try {
      const fixtureDb = drizzle(client);
      const [manager] = await fixtureDb
        .select({ branchId: user.branchId })
        .from(user)
        .where(eq(user.id, E2E_USER_IDS.KS_BRANCH_MANAGER));
      const [otherBranch] = await fixtureDb
        .select({ id: branches.id })
        .from(branches)
        .where(and(eq(branches.tenantId, home), eq(branches.code, 'KS-B')));
      const branchA = manager?.branchId;
      const branchB = otherBranch?.id;
      if (!branchA || !branchB || branchA === branchB)
        throw new Error('WP-19 needs two KS branches');

      await fixtureDb.transaction(async tx => {
        await tx.insert(user).values(staff);
        await tx.insert(claims).values(
          ids.map(id => ({
            id,
            tenantId: home,
            accessTenantId: id === transferredId ? access : null,
            branchId: id === wrongBranchId ? branchB : branchA,
            title: id,
            userId: E2E_USER_IDS.KS_MEMBER,
            staffId: id === localId ? staff[25].id : null,
            category: 'other',
            companyName: 'Synthetic company',
            caseLifecycleState: 'submitted' as const,
            recoveryLifecycleState: 'not_started' as const,
          }))
        );
        await tx.insert(claimDocuments).values(
          ids.flatMap(claimId =>
            Array.from({ length: claimId === wrongBranchId ? 1 : 28 }, (_, index) => ({
              id: documentId(claimId, index),
              claimId,
              tenantId: home,
              accessTenantId:
                index === 27
                  ? claimId === transferredId
                    ? home
                    : access
                  : claimId === transferredId
                    ? access
                    : index % 2 === 0
                      ? null
                      : home,
              uploadedBy: E2E_USER_IDS.KS_MEMBER,
              name: documentId(claimId, index),
              fileType: 'application/pdf',
              fileSize: 1,
              filePath: `pii/tenants/${home}/claims/${claimId}/${index}.pdf`,
            }))
          )
        );
      });
      try {
        await use({
          prefix,
          home,
          access,
          branchA,
          branchB,
          localId,
          transferredId,
          wrongBranchId,
          staff,
          staffAfter: staff[24].id,
        });
      } finally {
        await fixtureDb.transaction(async tx => {
          await tx.delete(claimDocuments).where(inArray(claimDocuments.claimId, ids));
          await tx.delete(claims).where(inArray(claims.id, ids));
          await tx.delete(user).where(
            inArray(
              user.id,
              staff.map(person => person.id)
            )
          );
        });
      }
    } finally {
      await client.end({ timeout: 2 });
    }
  },
});

pagingTest(
  'WP-19 restricted reader enforces session scope and current document visibility',
  async ({ claimFixture: { staff: _staff, ...fixture } }, info) => {
    test.setTimeout(120_000);
    await runRestrictedClaimReader(info, fixture);
  }
);

pagingTest(
  'admin detail pages under RLS and rechecks the actor, branch and access tenant',
  async (
    {
      door: { page, origin, locale },
      claimFixture: { prefix, localId, transferredId, wrongBranchId, branchB, staff },
    },
    info
  ) => {
    test.setTimeout(120_000);
    const path = (claimId: string, query = '') => `/admin/claims/${claimId}${query}`;
    const detail = page.locator('[data-admin-claim-detail]');
    const documents = page.getByTestId('ops-documents-panel');
    const rows = documents.getByTestId('ops-document-row');
    const staffSearch = page.locator('input[name="staffSearch"]');
    const picker = detail.getByRole('combobox', { name: 'Ricakto', exact: true });
    const documentNav = detail.getByRole('navigation', { name: 'Evidenca', exact: true });
    const staffNav = detail.getByRole('navigation', { name: 'Përgjegjësia e stafit', exact: true });
    const next = (nav: typeof documentNav) =>
      nav.getByRole('link', { name: 'Vazhdo', exact: true });
    const first = (nav: typeof documentNav) =>
      nav.getByRole('link', { name: 'Faqja e parë', exact: true });
    const expectDocuments = (claimId: string, start: number, end: number) =>
      expect(rows.locator('span[title]')).toHaveText(
        Array.from({ length: end - start }, (_, index) => documentId(claimId, start + index))
      );
    const expectStaff = async (start: number, end: number) => {
      await expect(picker).toBeVisible();
      await picker.click();
      const options = page.getByRole('listbox').getByRole('option');
      await expect(options).toHaveText(
        staff.slice(start, end).map(person => `${person.name} (${person.email})`)
      );
      await page.keyboard.press('Escape');
      await expect(page.getByRole('listbox')).toHaveCount(0);
    };
    const actor = async (key: Parameters<typeof loginAtDoor>[3]) => {
      await page.context().clearCookies();
      await page.context().addCookies([{ name: 'cookie_consent', value: 'accepted', url: origin }]);
      await loginAtDoor(page, origin, locale, key, info);
    };
    const open = (target: string, marker = 'ops-documents-panel') =>
      gotoApp(page, target, info, { baseURL: `${origin}/${locale}`, marker });
    const denied = async (target: string) => {
      await open(target, 'not-found-page');
      await expect(page).toHaveURL(
        url => url.pathname === new URL(`/${locale}${target}`, origin).pathname
      );
      await expect(page.locator('[data-not-found-scope="locale-not-found"]')).toBeVisible();
      await expect(detail).toHaveCount(0);
      await expect(page.getByText(documentId(wrongBranchId, 0), { exact: true })).toHaveCount(0);
      await expect(documents).toHaveCount(0);
      await expect(staffSearch).toHaveCount(0);
      await expect(page.getByRole('combobox', { name: 'Ricakto', exact: true })).toHaveCount(0);
    };
    const localAfter = documentId(localId, 24);
    const expectSearch = (documentsAfter: string | null, staffAfter: string | null) =>
      expect(page).toHaveURL(
        url =>
          url.searchParams.get('documentsAfter') === documentsAfter &&
          url.searchParams.get('staffAfter') === staffAfter &&
          url.searchParams.get('staffSearch') === prefix
      );

    await actor('KS_ADMIN');
    await open(path(localId));
    await expectDocuments(localId, 0, 25);
    await expect(detail.getByText(staff[25].name, { exact: true })).toBeVisible();
    await next(documentNav).click();
    await expect(page).toHaveURL(url => url.searchParams.get('documentsAfter') === localAfter);
    await expectDocuments(localId, 25, 27);
    await expect(next(documentNav)).toHaveCount(0);
    await expect(first(documentNav)).toHaveCount(1);

    await staffSearch.fill(prefix);
    await staffSearch.press('Enter');
    await expectSearch(localAfter, null);
    await expectStaff(0, 25);
    await next(staffNav).click();
    await expectSearch(localAfter, staff[24].id);
    await expectStaff(25, 26);
    await expect(next(staffNav)).toHaveCount(0);
    await expect(first(staffNav)).toHaveCount(1);

    await first(documentNav).click();
    await expectSearch(null, staff[24].id);
    await expectDocuments(localId, 0, 25);
    await next(documentNav).click();
    await expectSearch(localAfter, staff[24].id);
    await first(staffNav).click();
    await expectSearch(localAfter, null);
    await expectDocuments(localId, 25, 27);
    await expectStaff(0, 25);

    await open(path(wrongBranchId));
    await expectDocuments(wrongBranchId, 0, 1);
    await denied(
      path(transferredId, `?documentsAfter=${documentId(transferredId, 24)}&tenantId=${access}`)
    );

    await actor('MK_ADMIN');
    await open(path(transferredId));
    await expectDocuments(transferredId, 0, 25);
    await next(documentNav).click();
    await expect(page).toHaveURL(
      url => url.searchParams.get('documentsAfter') === documentId(transferredId, 24)
    );
    await expectDocuments(transferredId, 25, 27);
    await denied(path(localId, `?documentsAfter=${localAfter}&tenantId=${home}`));

    await actor('KS_BRANCH_MANAGER');
    await open(path(localId, `?documentsAfter=${localAfter}&staffSearch=${prefix}`));
    await expect(detail).toBeVisible();
    await expect(documents.getByTestId('ops-documents-empty')).toHaveText(
      '27 dokumente · Plotësia e provave nuk është konfirmuar.'
    );
    await expect(rows).toHaveCount(0);
    await expect(documents.getByRole('link')).toHaveCount(0);
    await expect(documentNav).toHaveCount(0);
    await expect(staffNav).toHaveCount(0);
    await expect(staffSearch).toHaveCount(0);
    await expect(picker).toHaveCount(0);
    await denied(path(wrongBranchId, `?branchId=${branchB}`));

    const injectedAdmin = `?userId=${E2E_USER_IDS.KS_ADMIN}&role=admin&tenantId=${home}&branchId=${branchB}&documentsAfter=${localAfter}`;
    await actor('KS_STAFF');
    await denied(path(localId, injectedAdmin));
    await actor('KS_MEMBER_A2');
    await denied(path(localId, injectedAdmin));
  }
);
