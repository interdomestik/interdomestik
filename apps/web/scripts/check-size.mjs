import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { gzipSize } from 'gzip-size';

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NEXT_DIR = path.join(APP_DIR, '.next');
const manifests = name => [
  path.join(NEXT_DIR, name),
  path.join(NEXT_DIR, 'standalone/apps/web/.next', name),
];
const BUILD_MANIFESTS = [
  ...manifests('build-manifest.json'),
  ...manifests('fallback-build-manifest.json'),
];
const LOADABLE_MANIFESTS = manifests('react-loadable-manifest.json');
const CRM_CONTRACT = path.join(APP_DIR, 'src/components/crm/charts/chart-contract.ts');
const SHA256 = /^[0-9a-f]{64}$/u,
  LOCAL_JS = /^static\/[A-Za-z0-9._~!$&'()+,;=@%\u005b\u005d/-]+\.js$/u;
const OD17_BRANCH = 'codex/ida-t115-od17-performance-proof';
const OD17_ORIGIN = /^https:\/\/interdomestik-web-[a-z0-9]{9}-ecohub\.vercel\.app$/u;
const VERCEL_ID = /^[A-Za-z0-9-]+(?:::[A-Za-z0-9_-]+)+$/u;
const sha = body => createHash('sha256').update(body).digest('hex');
const positive = value => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const codeUnit = (left, right) => Number(left > right) - Number(left < right);
const all = values => values.every(Boolean);

// prettier-ignore
export function isSafeOd17AssetPath(value) {
  if (typeof value !== 'string' || !LOCAL_JS.test(value)) return false;
  if (value.includes('\\') || value.includes('\0') || /%(?![0-9a-f]{2})/iu.test(value) || /%(?:00|2e|2f|5c)/iu.test(value)) return false;
  return !value.split('/').some(segment => ['', '.', '..'].includes(segment));
}
export function collectManifestJavaScriptPaths(value) {
  const paths = new Set();
  const visit = item => {
    if (isSafeOd17AssetPath(item)) paths.add(item);
    else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === 'object') Object.values(item).forEach(visit);
  };
  visit(value);
  return [...paths].sort(codeUnit);
}
// prettier-ignore
export function assertManifestInventory({ manifests: source, inventory }) {
  const expected = collectManifestJavaScriptPaths(source); const rows = new Map();
  if (!Array.isArray(inventory) || inventory.length !== expected.length) throw new Error('OD17_MANIFEST_INVENTORY_INVALID');
  for (const item of inventory) {
    const valid = item && isSafeOd17AssetPath(item.path) && SHA256.test(item.sha256 ?? '') && Number.isSafeInteger(item.bytes) && item.bytes > 0 && Number.isSafeInteger(item.gzipBytes) && item.gzipBytes > 0 && !rows.has(item.path);
    if (!valid) { throw new Error('OD17_MANIFEST_INVENTORY_INVALID'); } rows.set(item.path, item);
  }
  if (!expected.every(item => rows.has(item))) throw new Error('OD17_MANIFEST_INVENTORY_INVALID');
  return expected.map(item => rows.get(item));
}
function exactBody(value, digest) {
  if (typeof value !== 'string') return null;
  const body = Buffer.from(value, 'base64');
  return body.length > 0 && body.toString('base64') === value && sha(body) === digest ? body : null;
}
// prettier-ignore
function remoteClosure(item, origin) {
  const page = exactBody(item.pageBase64, item.pageSha256);
  const requests = item.report?.audits?.['network-requests']?.details?.items;
  if (!page || !Array.isArray(requests)) return null;
  const candidates = [...page.toString().matchAll(/<(?:script|link)[^>]+(?:src|href)=["']([^"']+)["']/giu)].map(match => match[1]);
  candidates.push(...requests.filter(row => /javascript/u.test(row?.mimeType ?? '') || String(row?.url ?? '').endsWith('.js')).map(row => row.url));
  const urls = new Set();
  for (const value of candidates) try { const url = new URL(value, item.url); if (url.origin === origin && url.pathname.endsWith('.js') && !url.search && !url.hash) urls.add(url.toString()); } catch { return null; }
  return [...urls].sort(codeUnit);
}
// prettier-ignore
function exactRemoteGzip(item, origin) {
  const expected = remoteClosure(item, origin); const rows = new Map(); let gzip = 0;
  if (!expected?.length || !Array.isArray(item.assets) || item.assets.length !== expected.length) return null;
  for (const asset of item.assets) {
    let url; try { url = new URL(asset?.url); } catch { return null; }
    const body = exactBody(asset?.bodyBase64, asset?.sha256);
    if (url.origin !== origin || url.search || url.hash || rows.has(url.toString()) || !body || !SHA256.test(asset.sha256)) return null;
    const bytes = gzipSync(body, { level: 9 }).length; if (bytes !== asset.gzipBytes) return null;
    rows.set(url.toString(), asset); gzip += bytes;
  }
  return JSON.stringify([...rows.keys()].sort(codeUnit)) === JSON.stringify(expected) ? gzip : null;
}
// prettier-ignore
function exactCanary(evidence, canary) { return all([Number(evidence.runId) === canary.runId, Number(evidence.runAttempt) === canary.runAttempt]); }
// prettier-ignore
function exactPreparation(evidence, preparation) { return all([Number(evidence.preparationRunId) === preparation.runId, Number(evidence.preparationRunAttempt) === preparation.runAttempt, Number(evidence.preparationArtifactId) === preparation.artifactId, evidence.preparationArtifactDigest === preparation.artifactDigest]); }
// prettier-ignore
function exactProvenance(evidence, expected) { return all([evidence.schemaVersion === 1, evidence.workflowPath === '.github/workflows/od17-preview-canary.yml', evidence.trustedMainSha === expected.expectedTrustedMainSha, Number(evidence.pullNumber) === Number(expected.pullNumber), positive(evidence.pullNumber), exactCanary(evidence, expected.canary ?? {}), exactPreparation(evidence, expected.preparation ?? {}), positive(evidence.deploymentId), positive(evidence.statusId)]); }
// prettier-ignore
function exactReport(item) { const report = item.report, raw = JSON.stringify(report); return all([typeof raw === 'string', SHA256.test(item.reportSha256 ?? ''), typeof raw === 'string' && sha(raw) === item.reportSha256, item.lighthouseVersion === report?.lighthouseVersion, /^(?:Headless)?Chrome\/\d+(?:\.\d+){3}$/u.test(item.chromeVersion ?? ''), report?.configSettings?.formFactor === 'mobile', report?.configSettings?.screenEmulation?.mobile === true]); }
// prettier-ignore
function evaluateObservation(item, origin, locales) {
  const identity = all([['sq', 'mk', 'en'].includes(item?.locale), !locales.has(item.locale), item.url === `${origin}/${item.locale}`, item.availabilityStatus === 200, item.unauthenticatedStatus !== 200, VERCEL_ID.test(item.vercelId ?? '')]);
  if (!identity) return 'measurement_capability_missing';
  locales.add(item.locale); const gzip = exactRemoteGzip(item, origin), reported = item.report?.categories?.performance?.score;
  const exact = all([gzip === item.gzipBytes, Number.isFinite(item.ttfbMs), item.ttfbMs > 0, Number.isFinite(item.score), Number.isFinite(reported), Math.round(reported * 100) === item.score, item.report?.finalDisplayedUrl === item.url, exactReport(item)]);
  if (!exact) return 'measurement_capability_missing';
  return item.score > 90 && gzip < 122880 && item.ttfbMs < 100 ? 'pass' : 'budget_failed';
}
// prettier-ignore
export function evaluateOd17Evidence({ evidence, expectedHeadSha, expected = {} }) {
  if (evidence?.failureClass === 'provider_failure') return 'provider_failure';
  if (evidence?.failureClass) return 'measurement_capability_missing';
  if (evidence?.headSha !== expectedHeadSha || evidence?.deploymentSha !== expectedHeadSha) return 'head_mismatch';
  const origin = evidence?.previewOrigin;
  const target = OD17_ORIGIN.test(origin ?? '') && evidence?.deploymentEnvironment === 'Preview' && evidence?.deploymentProduction === false && evidence?.deploymentRef === OD17_BRANCH && evidence?.eventName === 'workflow_dispatch' && evidence?.headBranch === 'main';
  if (!target) return 'target_mismatch';
  if (!exactProvenance(evidence, expected)) return 'measurement_capability_missing';
  const thresholds = { scoreAbove: 90, gzipBelow: 122880, ttfbBelowMs: 100 };
  if (JSON.stringify(evidence.thresholds) !== JSON.stringify(thresholds) || !Array.isArray(evidence.observations) || evidence.observations.length !== 3) return 'measurement_capability_missing';
  const locales = new Set();
  for (const item of evidence.observations) { const verdict = evaluateObservation(item, origin, locales); if (verdict !== 'pass') return verdict; }
  return locales.size === 3 && evidence.recomputedVerdict === 'pass' ? 'pass' : 'measurement_capability_missing';
}
// prettier-ignore
export async function verifyOd17Files({ localDir, evidenceDir, expectedHeadSha, ...expected }) {
  const readJson = file => fs.readFile(file, 'utf8').then(JSON.parse);
  const buildBody = await fs.readFile(path.join(localDir, 'build-manifest.json'));
  const build = JSON.parse(buildBody);
  const inventory = assertManifestInventory({ manifests: { build }, inventory: await readJson(path.join(localDir, 'inventory.json')) });
  for (const item of inventory) { const body = await fs.readFile(path.join(localDir, 'assets', item.path)); if (body.length !== item.bytes || gzipSync(body, { level: 9 }).length !== item.gzipBytes || sha(body) !== item.sha256) throw new Error('OD17_LOCAL_ASSET_MISMATCH'); }
  const structureBody = await fs.readFile(path.join(evidenceDir, 'local-structure.json'));
  const structure = JSON.parse(structureBody), evidence = await readJson(path.join(evidenceDir, 'evidence.json'));
  const exact = structure.headSha === expectedHeadSha && evidence.localStructureSha256 === sha(structureBody) && structure.manifests?.['build-manifest.json'] === sha(buildBody) && JSON.stringify(structure.inventory) === JSON.stringify(inventory);
  if (!exact) throw new Error('OD17_LOCAL_STRUCTURE_MISMATCH');
  return { evidence, inventory, verdict: evaluateOd17Evidence({ evidence, expectedHeadSha, expected }) };
}
// prettier-ignore
async function firstExisting(paths, retries = 1) { for (let attempt = 0; attempt < retries; attempt += 1) { for (const file of paths) { try { if ((await fs.stat(file)).size > 0) return file; } catch {} } await new Promise(resolve => setTimeout(resolve, 500)); } return null; }
const chunkGzip = file => fs.readFile(path.join(NEXT_DIR, file)).then(gzipSize);
// prettier-ignore
async function checkSize() {
  const manifestPath = await firstExisting(BUILD_MANIFESTS, 60); if (!manifestPath) throw new Error('Build manifest not found');
  const build = JSON.parse(await fs.readFile(manifestPath, 'utf8')); let failed = false; console.log('📊 Checking Bundle Sizes (Gzipped)...\n');
  if (build.rootMainFiles) { const size = (await Promise.all(build.rootMainFiles.map(chunkGzip))).reduce((sum, item) => sum + item, 0); console.log(`${size > 256000 ? '❌' : '✅'} Global Initial JS (Baseline)\n   Size: ${(size / 1024).toFixed(2)} KB\n   Limit: 250.00 KB`); failed ||= size > 256000; }
  const loadablePath = await firstExisting(LOADABLE_MANIFESTS);
  if (loadablePath) {
    const loadable = JSON.parse(await fs.readFile(loadablePath, 'utf8'));
    const match = (await fs.readFile(CRM_CONTRACT, 'utf8')).match(/CRM_REPORTING_CHART_BUNDLE_DELTA_KB_MAX\s*=\s*(\d+)/u); if (!match) throw new Error('CRM reporting chart bundle budget constant not found');
    const limit = Number(match[1]) * 1024, routes = [['/agent/crm', ['./pipeline-amount-chart']], ['/admin/crm', ['./pipeline-amount-chart']], ['/staff/crm', ['./pipeline-amount-chart', './funnel-movement-chart', './stage-velocity-chart']]];
    for (const [name, modules] of routes) { const files = [...new Set(modules.flatMap(module => loadable[`components/crm/charts/reporting-chart-boundary.tsx -> ${module}`]?.files ?? []).filter(file => file.endsWith('.js')))]; const size = (await Promise.all(files.map(chunkGzip))).reduce((sum, item) => sum + item, 0); console.log(`${files.length && size <= limit ? '✅' : '❌'} ${name}: ${(size / 1024).toFixed(2)} KB`); failed ||= files.length === 0 || size > limit; }
  }
  if (failed) { throw new Error('Performance budget exceeded'); } console.log('\n✨ All performance checks passed.');
}
// prettier-ignore
if (process.argv[1] === fileURLToPath(import.meta.url)) try { await checkSize(); } catch (error) { console.error(`❌ Failed to check bundle size: ${error.message}`); process.exitCode = 1; }
