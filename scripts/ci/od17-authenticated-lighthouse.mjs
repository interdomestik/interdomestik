import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
// prettier-ignore
import { assertCanonicalLocaleUrl, collectRemoteJavaScriptUrls, isMainModule, parseTrustedPreviewUrl, waitForChrome } from './od17-public-shell-performance.mjs';
// prettier-ignore
const HEADER = 'x-vercel-trusted-oidc-idp-token', LOCALES = ['sq', 'mk', 'en'];
const sha = value => createHash('sha256').update(value).digest('hex');
// prettier-ignore
export function buildRequestHeaders({ requestUrl, previewOrigin, oidcToken, headers = [] }) {
  const entries = Array.isArray(headers) ? headers : Object.entries(headers).map(([name, value]) => ({ name, value }));
  const clean = entries.filter(header => header.name.toLowerCase() !== HEADER);
  if (typeof oidcToken !== 'string' || !oidcToken) throw new Error('OD17_TOKEN_MISSING');
  if (new URL(requestUrl).origin === parseTrustedPreviewUrl(previewOrigin).origin) clean.push({ name: HEADER, value: oidcToken });
  return clean;
}
// prettier-ignore
export function redactToken(value, token) { return JSON.parse(JSON.stringify(value).split(token).join('[REDACTED]')); }
// prettier-ignore
export function assertTokenAbsent(body, token) { if (body.includes(Buffer.from(token))) throw new Error('OD17_TOKEN_REFLECTED'); }
// prettier-ignore
async function oidcToken() {
  const url = process.env.ACTIONS_ID_TOKEN_REQUEST_URL; const token = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!url || !token) throw new Error('OD17_OIDC_ENV_MISSING');
  const target = new URL(url); if (target.origin !== 'https://token.actions.githubusercontent.com' || target.username || target.password) throw new Error('OD17_OIDC_URL_INVALID');
  target.searchParams.set('audience', 'https://github.com/interdomestik');
  const response = await fetch(target, { headers: { authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('OD17_OIDC_REQUEST_FAILED');
  const value = (await response.json()).value; if (!value) throw new Error('OD17_OIDC_TOKEN_MISSING');
  delete process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN; return value;
}
// prettier-ignore
async function attachInterceptor({ webSocketDebuggerUrl, previewOrigin, token }) {
  const socket = new WebSocket(webSocketDebuggerUrl); const pending = new Map(); let ready; let id = 0;
  const state = { enabled: 0, paused: 0, fatal: null, closing: false, headerUrls: new Set() };
  const readiness = new Promise(resolve => { ready = resolve; });
  const send = (method, params, sessionId) => new Promise((resolve, reject) => {
    const callId = ++id;
    pending.set(callId, { resolve, reject });
    socket.send(JSON.stringify({ id: callId, method, params, ...(sessionId && { sessionId }) }));
  });
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const terminate = () => { if (state.closing) { return; } state.fatal = 'OD17_INTERCEPTOR_CONNECTION_LOST'; for (const waiter of pending.values()) { waiter.reject(new Error(state.fatal)); } pending.clear(); };
  socket.onerror = terminate; socket.onclose = terminate;
  socket.onmessage = async event => { try {
    const message = JSON.parse(event.data);
    if (message.id) {
      const waiter = pending.get(message.id); pending.delete(message.id);
      return message.error ? waiter?.reject(new Error(message.error.message)) : waiter?.resolve(message.result);
    }
    if (message.method === 'Target.attachedToTarget') {
      const session = message.params.sessionId; await send('Fetch.enable', {}, session); state.enabled += 1; ready();
      await send('Runtime.runIfWaitingForDebugger', {}, session);
    }
    if (message.method === 'Fetch.requestPaused') {
      try {
        const headers = buildRequestHeaders({ requestUrl: message.params.request.url,
          previewOrigin, oidcToken: token, headers: message.params.request.headers });
        state.paused += 1; if (headers.some(header => header.name.toLowerCase() === HEADER))
          state.headerUrls.add(message.params.request.url);
        await send('Fetch.continueRequest', { requestId: message.params.requestId, headers }, message.sessionId);
      } catch { state.fatal = 'OD17_INTERCEPTOR_REQUEST_FAILED';
        await send('Fetch.failRequest', { requestId: message.params.requestId, errorReason: 'Failed' }, message.sessionId); }
    }
  } catch { state.fatal = 'OD17_INTERCEPTOR_HANDLER_FAILED'; } };
  await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
  const pages = (await send('Target.getTargets')).targetInfos.filter(target => target.type === 'page');
  for (const page of pages) await send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
  await Promise.race([readiness,
    new Promise((_, reject) => setTimeout(() => reject(new Error('OD17_INTERCEPTOR_NOT_READY')), 5000))]);
  return { socket, state };
}
// prettier-ignore
function htmlAssetUrls(html, base) { return [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)=["']([^"']+)["']/giu)]
  .map(match => new URL(match[1], base).toString()); }
// prettier-ignore
async function fetchExact(url, token, javascript = false) {
  const target = parseTrustedPreviewUrl(url); const started = performance.now();
  const response = await fetch(target, { redirect: 'manual', headers: { [HEADER]: token } });
  const ttfb = performance.now() - started;
  if (response.status !== 200 || response.headers.get('location')) throw new Error('OD17_REMOTE_FETCH_INVALID');
  if (javascript && !/javascript/u.test(response.headers.get('content-type') ?? '')) throw new Error('OD17_NOT_JAVASCRIPT');
  const body = Buffer.from(await response.arrayBuffer());
  assertTokenAbsent(body, token); if (body.length > 5_000_000) throw new Error('OD17_REMOTE_ASSET_TOO_LARGE');
  return { body, ttfb, status: response.status, contentType: response.headers.get('content-type'),
    vercelId: response.headers.get('x-vercel-id') };
}
// prettier-ignore
const addRemoteBytes = (total, ...bodies) => { const next = bodies.reduce((sum, body) => sum + body.length, total); if (next > 25_000_000) { throw new Error('OD17_REMOTE_TOTAL_TOO_LARGE'); } return next; },
  unauthenticatedStatus = async url => { const status = (await fetch(parseTrustedPreviewUrl(url), { redirect: 'manual' })).status; if (status === 200) { throw new Error('OD17_OIDC_NOT_REQUIRED'); } return status; },
  assertPageEvidence = ({ page, document, state, url }) => { if (!page.vercelId || !/text\/html/u.test(page.contentType ?? '')) { throw new Error('OD17_PAGE_PROVENANCE_INVALID'); } if (document?.statusCode !== 200 || state.fatal || !state.headerUrls.has(url)) { throw new Error('OD17_LIGHTHOUSE_DOCUMENT_INVALID'); } },
  assertAssetClosure = (pageUrls, urls) => { if (!pageUrls.filter(item => new URL(item).pathname.endsWith('.js')).every(item => urls.includes(item))) { throw new Error('OD17_LIGHTHOUSE_DOCUMENT_MISMATCH'); } };
// prettier-ignore
async function run() {
  const previewOrigin = parseTrustedPreviewUrl(process.env.OD17_PREVIEW_URL).origin; const token = await oidcToken(); const port = 9222;
  // prettier-ignore
  const chrome = spawn('/usr/bin/google-chrome', ['--headless=new', '--no-sandbox', `--remote-debugging-port=${port}`,
    '--remote-debugging-address=127.0.0.1', '--user-data-dir=/tmp/od17-chrome'], { stdio: 'ignore' });
  chrome.on('error', () => {});
  try {
    const version = await waitForChrome(); const { default: lighthouse } = await import('lighthouse');
    const { socket, state } = await attachInterceptor({ webSocketDebuggerUrl: version.webSocketDebuggerUrl, previewOrigin, token });
    const observations = []; let remoteBytes = 0;
    for (const locale of LOCALES) {
      const url = `${previewOrigin}/${locale}`;
      const page = await fetchExact(url, token); const availability = await fetchExact(url, token);
      remoteBytes = addRemoteBytes(remoteBytes, page.body, availability.body);
      const unauthenticated = await unauthenticatedStatus(url);
      const result = await lighthouse(url, { port, output: 'json', onlyCategories: ['performance'], formFactor: 'mobile' });
      assertCanonicalLocaleUrl({ requestedUrl: url, finalUrl: result.lhr.finalDisplayedUrl });
      const requests = result.lhr.audits['network-requests'].details.items;
      const document = requests.find(item => item.url === url && item.resourceType === 'Document'); assertPageEvidence({ page, document, state, url });
      const pageUrls = htmlAssetUrls(page.body.toString(), url).filter(item => new URL(item).origin === previewOrigin);
      const urls = collectRemoteJavaScriptUrls({ previewOrigin, pageUrls, lighthouseRequests: requests });
      assertAssetClosure(pageUrls, urls);
      const assets = [];
      for (const assetUrl of urls) {
        const asset = await fetchExact(assetUrl, token, true);
        remoteBytes = addRemoteBytes(remoteBytes, asset.body);
        assets.push({ url: assetUrl, sha256: sha(asset.body), gzipBytes: gzipSync(asset.body, { level: 9 }).length,
          bodyBase64: asset.body.toString('base64') });
      }
      // prettier-ignore
      observations.push({ locale, url, ttfbMs: page.ttfb, vercelId: page.vercelId,
        availabilityStatus: availability.status, unauthenticatedStatus: unauthenticated,
        pageBase64: page.body.toString('base64'), pageSha256: sha(page.body),
        score: result.lhr.categories.performance.score * 100, assets,
        gzipBytes: assets.reduce((total, asset) => total + asset.gzipBytes, 0),
        reportSha256: sha(result.report), lighthouseVersion: result.lhr.lighthouseVersion,
        chromeVersion: version.Browser, report: JSON.parse(result.report) });
    }
    state.closing = true; socket.close(); const pass = observations.every(item => item.assets.length > 0 && item.score > 90 && item.gzipBytes < 122_880 && item.ttfbMs < 100);
    const localStructureSha256 = sha(await readFile('tmp/od17-evidence/local-structure.json'));
    const evidence = redactToken({ schemaVersion: 1, workflowPath: '.github/workflows/od17-preview-canary.yml',
      headSha: process.env.EXPECTED_HEAD_SHA, pullNumber: process.env.PULL_NUMBER,
      trustedMainSha: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      eventName: process.env.GITHUB_EVENT_NAME, headBranch: process.env.GITHUB_REF_NAME,
      preparationRunId: process.env.OD17_PREPARATION_RUN_ID, preparationRunAttempt: process.env.OD17_PREPARATION_RUN_ATTEMPT, preparationArtifactId: process.env.OD17_PREPARATION_ARTIFACT_ID, preparationArtifactDigest: process.env.OD17_PREPARATION_ARTIFACT_DIGEST,
      previewOrigin, deploymentId: process.env.OD17_DEPLOYMENT_ID, deploymentSha: process.env.OD17_DEPLOYMENT_SHA,
      deploymentEnvironment: process.env.OD17_DEPLOYMENT_ENVIRONMENT, deploymentProduction: false,
      deploymentRef: process.env.OD17_DEPLOYMENT_REF, localStructureSha256,
      statusId: process.env.OD17_STATUS_ID, thresholds: { scoreAbove: 90, gzipBelow: 122880, ttfbBelowMs: 100 },
      headerUrls: [...state.headerUrls], runtime: { node: process.version, zlib: process.versions.zlib },
      recomputedVerdict: pass && state.paused > 0 ? 'pass' : 'fail', observations }, token);
    const serialized = `${JSON.stringify(evidence, null, 2)}\n`; if (Buffer.byteLength(serialized) > 50_000_000) throw new Error('OD17_EVIDENCE_TOO_LARGE');
    await mkdir('tmp/od17-evidence', { recursive: true }); await writeFile('tmp/od17-evidence/evidence.json', serialized, { mode: 0o600 });
  } finally { chrome.kill('SIGTERM'); }
}
// prettier-ignore
if (isMainModule(process.argv[1], import.meta.url)) try { await run(); } catch (error) { await mkdir('tmp/od17-evidence', { recursive: true }); const failureClass = /OIDC|REMOTE|DEPLOYMENT/u.test(error.message) ? 'provider_failure' : 'measurement_capability_missing'; const failure = { schemaVersion: 1, recomputedVerdict: 'fail', failureClass, errorCode: 'OD17_COLLECTOR_FAILED' }; await writeFile('tmp/od17-evidence/evidence.json', `${JSON.stringify(failure, null, 2)}\n`, { mode: 0o600 }); console.error('OD17_COLLECTOR_FAILED'); process.exitCode = 1; }
