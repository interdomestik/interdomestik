import { E2E_PASSWORD } from '@interdomestik/database';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { account, interactiveLogin } from './login-handoff-page';
import { passiveRoleObserver, record } from './login-handoff-observer';

export async function heldLogin(page: Page, info: TestInfo, locale: string, admin = false) {
  const identity = account(info, admin);
  await page.goto(`/${locale}/login`);
  await interactiveLogin(page, locale);
  const target = `/${locale}/${admin ? 'admin/overview' : 'member'}`;
  const origin = new URL(page.url()).origin;
  const observer = await passiveRoleObserver(page, origin, identity.dbRole, admin);
  let passwordPosts = 0;
  let roleGets = 0;
  page.on('request', request => {
    if (new URL(request.url()).origin !== origin) return;
    if (
      new URL(request.url()).pathname === '/api/auth/sign-in/email' &&
      request.method() === 'POST'
    )
      passwordPosts++;
    if (new URL(request.url()).pathname === '/api/auth/login-session' && request.method() === 'GET')
      roleGets++;
  });
  const navigation = await page.context().newCDPSession(page);
  const { frameTree } = await navigation.send('Page.getFrameTree');
  let destinationHeld = false;
  let heldAt = 0;
  let pausedId: string | null = null;
  let upstreamStatus: number | undefined;
  let interceptionEnabled = true;
  await navigation.send('Fetch.enable', {
    patterns: [
      {
        urlPattern: `${origin}${target}`,
        resourceType: 'Document',
        requestStage: 'Response',
      },
    ],
  });
  navigation.on('Fetch.requestPaused', event => {
    const url = new URL(event.request.url);
    if (
      url.origin !== origin ||
      url.pathname !== target ||
      url.search ||
      event.resourceType !== 'Document' ||
      event.request.method !== 'GET' ||
      event.frameId !== frameTree.frame.id
    ) {
      void navigation.send('Fetch.continueResponse', { requestId: event.requestId });
      return;
    }
    pausedId = event.requestId;
    upstreamStatus = event.responseStatusCode;
    heldAt = Date.now();
    destinationHeld = true;
  });
  let closed = false;
  const release = async () => {
    if (pausedId) {
      const id = pausedId;
      pausedId = null;
      await navigation.send('Fetch.continueResponse', { requestId: id });
    }
    if (interceptionEnabled) {
      await navigation.send('Fetch.disable');
      interceptionEnabled = false;
    }
  };
  const close = async () => {
    if (closed) return;
    closed = true;
    if (interceptionEnabled) {
      await navigation.send('Fetch.disable');
      interceptionEnabled = false;
    }
    try {
      await navigation.detach();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('No session with given id'))
        throw Error('document fixture detach failed');
    }
    await observer.close();
  };
  const form = page.getByTestId('login-form');
  await form.getByTestId('login-email').fill(identity.email);
  await form.getByTestId('login-password').fill(E2E_PASSWORD);
  type Controls = {
    at: number;
    sequence: number;
    owned: boolean;
    disabled: boolean;
    changedCopy: boolean;
    retainedCopy: boolean;
    x: number | null;
    y: number | null;
  };
  let controls: Controls | null = null;
  await page.exposeBinding('__observeLoginControls', (source, value: Controls) => {
    if (source.frame === page.mainFrame()) controls = value;
  });
  await page.evaluate(expectedPath => {
    const initial = document.querySelector('[data-testid="login-submit"]')?.textContent?.trim();
    let busyCopy: string | undefined;
    let sequence = 0;
    const snapshot = () => {
      const form = document.querySelector('[data-testid="login-form"]');
      const submit = form?.querySelector<HTMLButtonElement>('[data-testid="login-submit"]');
      const email = form?.querySelector<HTMLInputElement>('[data-testid="login-email"]');
      const password = form?.querySelector<HTMLInputElement>('[data-testid="login-password"]');
      const copy = submit?.textContent?.trim();
      if (submit?.disabled && copy && copy !== initial && !busyCopy) busyCopy = copy;
      const box = submit?.getBoundingClientRect();
      return {
        at: Date.now(),
        sequence: ++sequence,
        owned:
          location.pathname === expectedPath &&
          document.querySelectorAll('[data-testid="login-form"]').length === 1,
        disabled:
          submit?.disabled === true && email?.disabled === true && password?.disabled === true,
        changedCopy: Boolean(copy) && copy !== initial,
        retainedCopy: Boolean(busyCopy) && copy === busyCopy,
        x: box ? box.x + box.width / 2 : null,
        y: box ? box.y + box.height / 2 : null,
      };
    };
    const owner = window as unknown as {
      __observeLoginControls: (value: unknown) => Promise<void>;
    };
    const emit = () => {
      void owner.__observeLoginControls(snapshot()).catch(() => {});
    };
    const timer = setInterval(emit, 25);
    const observer = new MutationObserver(emit);
    observer.observe(document, { childList: true, subtree: true, attributes: true });
    window.addEventListener(
      'pagehide',
      () => {
        clearInterval(timer);
        observer.disconnect();
      },
      { once: true }
    );
    emit();
  }, `/${locale}/login`);
  const passwordResponse = page
    .waitForResponse(
      r =>
        new URL(r.url()).pathname === '/api/auth/sign-in/email' && r.request().method() === 'POST'
    )
    .then(async response => ({ status: response.status(), body: record(await response.json()) }));
  const startedAt = Date.now();
  try {
    await test.step('native submit without awaiting the held document', () =>
      form.getByTestId('login-submit').click({ noWaitAfter: true }));
    await test.step('verified destination document requested', () =>
      expect.poll(() => destinationHeld, { timeout: 10_000 }).toBe(true));
    const response = await test.step('read real password response verdict', () => passwordResponse);
    expect(response.status).toBe(200);
    const body = response.body;
    const owner = record(body?.user);
    await test.step('read passive durable real role verdict', () =>
      expect.poll(() => observer.read() !== null, { timeout: 5000 }).toBe(true));
    const role = observer.read();
    expect(role?.status === 200 && role.bodyRead && role.validated).toBe(true);
    await test.step('fresh held-document busy controls from preinstalled sampler', () =>
      expect.poll(() => controls !== null && controls.at > heldAt, { timeout: 5000 }).toBe(true));
    const busy = controls as Controls | null;
    expect(upstreamStatus).toBe(200);
    await test.step('held controls ownership disabled and localized busy copy', async () => {
      expect(busy?.owned && busy.disabled && busy.changedCopy && busy.retainedCopy).toBe(true);
    });
    if (!busy || busy.x === null || busy.y === null) throw Error('visible submit geometry missing');
    await test.step(
      'native repeat pointer while document held',
      () => page.mouse.click(busy.x!, busy.y!),
      { timeout: 5000 }
    );
    await test.step('native repeat Enter while document held', () => page.keyboard.press('Enter'), {
      timeout: 5000,
    });
    const repeatFinishedAt = Date.now();
    await test.step('fresh sampler after native repeat', () =>
      expect
        .poll(
          () =>
            controls !== null &&
            controls.sequence > busy.sequence &&
            controls.at > repeatFinishedAt,
          { timeout: 5000 }
        )
        .toBe(true));
    const repeated = controls as Controls | null;
    expect(
      repeated?.owned && repeated.disabled && repeated.changedCopy && repeated.retainedCopy
    ).toBe(true);
    expect(passwordPosts).toBe(1);
    expect(roleGets).toBe(1);
    return {
      target,
      startedAt,
      token: typeof body?.token === 'string' ? body.token : null,
      ownerId: typeof owner?.id === 'string' ? owner.id : null,
      identity,
      passwordPostCount: () => passwordPosts,
      release,
      close,
      async stop() {
        await navigation.send('Page.stopLoading');
        if (pausedId) {
          const id = pausedId;
          pausedId = null;
          try {
            await navigation.send('Fetch.failRequest', { requestId: id, errorReason: 'Aborted' });
          } catch {
            /* Native Stop may already have canceled this exact held document. */
          }
        }
        if (interceptionEnabled) {
          await navigation.send('Fetch.disable');
          interceptionEnabled = false;
        }
        await expect(page).toHaveURL(new RegExp(`/${locale}/login(?:\\?|$)`));
      },
    };
  } catch (error) {
    try {
      await release();
      await close();
    } catch {
      /* Preserve primary failure; owned context closes. */
    }
    throw error;
  }
}
