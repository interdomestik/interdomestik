import { expect, type Locator, type Page, type Response, type TestInfo } from '@playwright/test';

type TruthState = {
  static404s: Set<string>;
  consoleErrors: string[];
  pageErrors: string[];
};

const truthState = new WeakMap<Page, TruthState>();

function getState(page: Page): TruthState {
  let state = truthState.get(page);
  if (!state) {
    state = { static404s: new Set<string>(), consoleErrors: [], pageErrors: [] };
    truthState.set(page, state);
  }
  return state;
}

function isNextStatic(url: string): boolean {
  return /\/_next\/static\/(css|chunks|media)\//.test(url);
}

function recordStatic404(page: Page, url: string) {
  const state = getState(page);
  state.static404s.add(url);
}

export function installTruthLogging(page: Page): void {
  const state = getState(page);

  page.on('console', msg => {
    if (msg.type() === 'error') {
      state.consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    state.pageErrors.push(err.message);
  });
  page.on('response', (response: Response) => {
    const url = response.url();
    if (response.status() === 404 && isNextStatic(url)) {
      recordStatic404(page, url);
    }
  });
  page.on('requestfailed', request => {
    const url = request.url();
    if (isNextStatic(url)) {
      recordStatic404(page, url);
    }
  });
}

export function assertNotRedirectedToLogin(page: Page): void {
  const url = page.url();
  const isLogin = /\/login\b/.test(url);
  if (isLogin) {
    const diag = `[TRUTH] url=${url} loginRedirect=true`;
    throw new Error(diag);
  }
}

export function assertNoNextStatic404s(page: Page): void {
  const state = getState(page);
  const count = state.static404s.size;
  if (count > 0) {
    const first = Array.from(state.static404s)[0];
    const diag = `[TRUTH] url=${page.url()} loginRedirect=false nextStatic404s=${count} example=${first}`;
    throw new Error(diag);
  }
}

export async function assertClickableTarget(
  page: Page,
  locator: Locator,
  name: string
): Promise<void> {
  const box = await locator.boundingBox();
  if (!box) {
    const diag = `[TRUTH] url=${page.url()} target=${name} clickTarget=missing`;
    throw new Error(diag);
  }
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const result = await locator.evaluate((element: Element, payload: { x: number; y: number }) => {
    const { x, y } = payload;
    const target = document.elementFromPoint(x, y) as HTMLElement | null;
    if (!target) {
      return { ok: false, hit: null };
    }
    const ok = target === element || element.contains(target);
    const hit = {
      tag: target.tagName,
      testid: target.dataset.testid,
      ariaLabel: target.getAttribute('aria-label'),
      id: target.id,
      className: target.className,
      text: target.textContent?.slice(0, 80) ?? '',
    };
    return { ok, hit };
  }, center);

  if (!result?.ok) {
    const hit = result?.hit
      ? `${result.hit.tag}[data-testid=${result.hit.testid ?? 'n/a'}]`
      : 'none';
    const diag = `[TRUTH] url=${page.url()} loginRedirect=false nextStatic404s=0 interceptedBy="${hit}" target="${name}"`;
    throw new Error(diag);
  }
}

export async function disableAnimations(page: Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition-duration: 0s !important;
        animation-duration: 0s !important;
        animation-delay: 0s !important;
      }
    `,
  });
}

type ActionMatch = {
  urlPart: string | RegExp;
  method?: string;
  statusIn?: number[];
  timeoutMs?: number;
};

type ActionResponse = {
  url: string;
  method: string;
  status: number;
  ok: boolean;
  json?: unknown;
  textExcerpt?: string;
};

type ServerActionParseResult = { found: true; value: unknown } | { found: false };

function parseServerActionJsonFromText(bodyText: string): ServerActionParseResult {
  // Next/React server actions may return a streamed, line-based payload like:
  // 0:{...}\n1:{"success":true,...}
  // Best-effort: parse the last JSON-looking line.
  const lines = bodyText.split('\n');
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i]?.trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const maybeJson = line.slice(idx + 1).trim();
    if (!maybeJson.startsWith('{') && !maybeJson.startsWith('[')) continue;
    try {
      return { found: true, value: JSON.parse(maybeJson) as unknown };
    } catch {
      // ignore
    }
  }
  return { found: false };
}

export function installNetworkTruthProbes(
  page: Page,
  testInfo: TestInfo,
  opts?: {
    logUrlIf?: (url: string) => boolean;
    maxBodyChars?: number;
  }
): void {
  const logUrlIf =
    opts?.logUrlIf ??
    ((url: string) =>
      url.includes('/api') ||
      url.includes('/trpc') ||
      url.includes('/actions') ||
      url.includes('/_next/data'));

  const maxBodyChars = opts?.maxBodyChars ?? 600;

  page.on('requestfailed', req => {
    const url = req.url();
    if (!logUrlIf(url)) return;
    const failure = req.failure()?.errorText ?? 'unknown';
    console.log(`[net:requestfailed] ${req.method()} ${url} :: ${failure}`);
  });

  page.on('response', async res => {
    const url = res.url();
    if (!logUrlIf(url)) return;

    const status = res.status();
    const method = res.request().method();

    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
    const isBad = status >= 400;

    if (!isMutation && !isBad) return;

    let excerpt = '';
    try {
      const txt = await res.text();
      excerpt = txt.slice(0, maxBodyChars);
    } catch {
      excerpt = '<unreadable body>';
    }

    const line = `[net:response] ${method} ${status} ${url} :: ${excerpt}`;
    console.log(line);

    try {
      await testInfo.attach(`net-${method}-${status}-${Date.now()}.txt`, {
        body: line,
        contentType: 'text/plain',
      });
    } catch {
      // Best-effort only; never fail tests because attachment failed.
    }
  });
}

export async function waitForActionResponse(
  page: Page,
  match: ActionMatch
): Promise<ActionResponse> {
  const timeout = match.timeoutMs ?? 30_000;

  const res = await page.waitForResponse(
    r => {
      const url = r.url();
      const method = r.request().method();

      const urlOk =
        typeof match.urlPart === 'string' ? url.includes(match.urlPart) : match.urlPart.test(url);
      const methodOk = match.method ? method === match.method : true;

      return urlOk && methodOk;
    },
    { timeout }
  );

  const url = res.url();
  const method = res.request().method();
  const status = res.status();
  const ok = res.ok();

  if (match.statusIn?.length) {
    expect(match.statusIn, `Unexpected status for ${method} ${url}`).toContain(status);
  }

  let json: unknown;
  let hasJson = false;
  let excerpt: string | undefined;

  try {
    json = await res.json();
    hasJson = true;
  } catch {
    try {
      const txt = await res.text();
      excerpt = txt.slice(0, 600);

      const parsed = parseServerActionJsonFromText(txt);
      if (parsed.found) {
        json = parsed.value;
        hasJson = true;
      }
    } catch {
      excerpt = '<unreadable body>';
    }
  }

  const result: ActionResponse = { url, method, status, ok, textExcerpt: excerpt };
  if (hasJson) result.json = json;
  return result;
}
