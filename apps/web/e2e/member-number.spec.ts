import { db } from '@interdomestik/database/db';
import { user } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { expect, test } from './fixtures/auth.fixture';
import { getProjectUrlInfo, getTenantFromTestInfo, type Tenant } from './fixtures/auth.project';
import { routes } from './routes';
import { withAnonymousPage } from './utils/anonymous-context';
import { gotoApp } from './utils/navigation';

// Enable full trace for this test suite
test.use({ trace: 'on' });

function resolveTenantId(tenant: Tenant) {
  switch (tenant) {
    case 'pilot':
      return 'pilot-mk';
    case 'mk':
      return 'tenant_mk';
    default:
      return 'tenant_ks';
  }
}

async function registerMemberViaAuthApi(args: {
  page: {
    request: {
      post: (
        url: string,
        options: { data: unknown; headers: Record<string, string> }
      ) => Promise<{
        ok(): boolean;
        status(): number;
        text(): Promise<string>;
        url(): string;
      }>;
    };
  };
  baseURL: string;
  tenantId: string;
  email: string;
  password: string;
  name: string;
  locale: string;
  projectHeaders: Record<string, string>;
}) {
  const response = await args.page.request.post(
    new URL('/api/auth/sign-up/email', args.baseURL).toString(),
    {
      data: {
        email: args.email,
        name: args.name,
        password: args.password,
        callbackURL: '/login',
        tenantId: args.tenantId,
        tenantClassificationPending: true,
      },
      headers: {
        Origin: args.baseURL,
        Referer: `${args.baseURL}/${args.locale}/register?tenantId=${args.tenantId}`,
        ...args.projectHeaders,
      },
    }
  );

  if (!response.ok()) {
    throw new Error(`Registration auth API failed: ${response.status()} ${await response.text()}`);
  }

  return response;
}

async function loginMemberViaApi(args: {
  page: {
    request: {
      post: (
        url: string,
        options: { data: unknown; headers: Record<string, string> }
      ) => Promise<{
        ok(): boolean;
        status(): number;
        text(): Promise<string>;
        url(): string;
      }>;
    };
  };
  origin: string;
  locale: string;
  projectHeaders: Record<string, string>;
  email: string;
  password: string;
}) {
  const response = await args.page.request.post(
    new URL('/api/auth/sign-in/email', args.origin).toString(),
    {
      data: {
        email: args.email,
        password: args.password,
      },
      headers: {
        Origin: args.origin,
        Referer: `${args.origin}/${args.locale}/login`,
        ...args.projectHeaders,
      },
    }
  );

  if (!response.ok()) {
    throw new Error(`Member login API failed: ${response.status()} ${await response.text()}`);
  }

  return response;
}

test.describe('Member Number Hardening @quarantine', () => {
  test.beforeEach(({ page }) => {
    // Diagnostics: Console & Network (with noise filtering)
    page.on('console', msg => {
      const text = msg.text();
      // Filter out standard React/Next.js dev noise
      if (
        text.includes('React DevTools') ||
        text.includes('[HMR]') ||
        text.includes('[Fast Refresh]')
      ) {
        return;
      }
      console.log(`[BROWSER]: ${text}`);
    });
    page.on('pageerror', err => console.error(`[BROWSER ERROR]: ${err}`));
    page.on('response', async resp => {
      if (resp.status() >= 400 && resp.url().includes('/api')) {
        const body = await resp.text().catch(() => 'no-body');
        console.log(`[API ERROR ${resp.status()}]: ${resp.url()} - ${body}`);
      }
    });
  });

  test('should assign member number immediately upon registration (Production Grade)', async ({
    browser,
    page,
  }, testInfo) => {
    const tenantId = resolveTenantId(getTenantFromTestInfo(testInfo));
    const info = getProjectUrlInfo(testInfo, null);
    const projectHeaders = (testInfo.project.use.extraHTTPHeaders || {}) as Record<string, string>;

    const email = `mem-prod-${Date.now()}@example.com`;
    const password = 'Password123!';
    const memberName = 'Test ProdMember';

    console.log('Creating member through public auth sign-up API...');
    const response = await withAnonymousPage(browser, testInfo, anonymousPage =>
      registerMemberViaAuthApi({
        page: anonymousPage,
        baseURL: info.origin,
        tenantId,
        email,
        password,
        name: memberName,
        locale: info.locale,
        projectHeaders,
      })
    );
    console.log(`Registration API Success: ${response.status()} ${response.url()}`);

    // 3. Verify DB State (The Real Truth)
    const member = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    if (!member) {
      throw new Error(`User ${email} NOT found in DB after successful API call`);
    }

    console.log('DB Assertion: Checking Role...');
    expect(member.role).toBe('member');

    console.log('DB Assertion: Checking Member Number presence...');
    expect(member.memberNumber).not.toBeNull();
    expect(member.memberNumberIssuedAt).not.toBeNull();
    expect(member.memberNumber).toMatch(/^MEM-\d{4}-\d{6}$/);

    console.log(`Verified Member Number: ${member.memberNumber}`);

    // Year Check
    const effectiveDate = member.createdAt;
    const expectedYear = effectiveDate.getFullYear();
    const actualYear = parseInt(member.memberNumber!.split('-')[1]);

    console.log(`DB Assertion: Year Derivation (${expectedYear}) vs Actual (${actualYear})`);
    expect(actualYear).toBe(expectedYear);

    // 4. Immutability Check (Relogin)
    console.log('Immutability Check: Re-logging in via auth API...');
    await page.context().clearCookies();
    await loginMemberViaApi({
      page,
      origin: info.origin,
      locale: info.locale,
      projectHeaders,
      email,
      password,
    });
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

    const memberAfterLogin = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    expect(memberAfterLogin?.memberNumber).toBe(member.memberNumber);
    console.log('Immutability Verified: Member number unchanged after login.');
  });

  test('should self-heal missing member number on login with correct year', async ({
    browser,
    page,
  }, testInfo) => {
    const tenantId = resolveTenantId(getTenantFromTestInfo(testInfo));
    const info = getProjectUrlInfo(testInfo, null);
    const projectHeaders = (testInfo.project.use.extraHTTPHeaders || {}) as Record<string, string>;

    const lastYear = new Date().getFullYear() - 1;
    const pastDate = new Date(`${lastYear}-06-15T12:00:00Z`); // Specific date in past year
    const email = `heal-${Date.now()}@example.com`;
    const password = 'Password123!';
    await withAnonymousPage(browser, testInfo, anonymousPage =>
      registerMemberViaAuthApi({
        page: anonymousPage,
        baseURL: info.origin,
        tenantId,
        email,
        password,
        name: 'Heal Member',
        locale: info.locale,
        projectHeaders,
      })
    );

    // Simulating "broken state": remove memberNumber and backdate createdAt
    await db
      .update(user)
      .set({
        memberNumber: null,
        memberNumberIssuedAt: null,
        createdAt: pastDate,
      })
      .where(eq(user.email, email));

    // Logout
    await page.context().clearCookies();

    // 2. Login again to trigger self-heal
    await loginMemberViaApi({
      page,
      origin: info.origin,
      locale: info.locale,
      projectHeaders,
      email,
      password,
    });
    await gotoApp(page, routes.member(testInfo), testInfo, { marker: 'member-dashboard-ready' });

    // 3. Verify self-heal worked and respected the creation year
    const healedMember = await db.query.user.findFirst({
      where: eq(user.email, email),
    });

    expect(healedMember?.memberNumber).toMatch(new RegExp(`^MEM-${lastYear}-\\d{6}$`));
    console.log(
      `Verified self-heal: ${healedMember?.memberNumber} for user created in ${lastYear}`
    );
  });
});
