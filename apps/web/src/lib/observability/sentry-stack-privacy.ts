import { parseTelemetryUrl, safeTelemetryOrigin } from './sentry-origin-privacy';
import { isSafeBuildRoute } from './sentry-route-patterns';

const ASSET_PREFIXES = new Set([
  'webpack',
  'main',
  'main-app',
  'framework',
  'polyfills',
  'app',
  'page',
  'layout',
  'error',
  'global-error',
  'not-found',
]);
const SERVER_STEMS = new Set([
  'page',
  'layout',
  'route',
  'default',
  'loading',
  'error',
  'global-error',
  'not-found',
  'template',
  'webpack-runtime',
  '_app',
  '_document',
  '_error',
]);
const HASH = /^[a-f0-9]{6,64}$/i;
const CHUNK_FILE = /^(?:\d{1,8}|[a-f0-9]{6,64})\.(?:js|mjs)$/i;
const NODE_MODULES = new Set([
  'node:async_hooks',
  'node:buffer',
  'node:events',
  'node:fs',
  'node:fs/promises',
  'node:http',
  'node:https',
  'node:net',
  'node:stream',
  'node:stream/promises',
  'node:timers',
  'node:tls',
  'node:url',
  'node:util',
  'node:internal/async_hooks',
  'node:internal/modules/cjs/loader',
  'node:internal/modules/esm/loader',
  'node:internal/modules/esm/module_job',
  'node:internal/process/execution',
  'node:internal/process/promises',
  'node:internal/process/task_queues',
  'node:internal/streams/destroy',
  'node:internal/streams/readable',
  'node:internal/streams/writable',
  'node:internal/timers',
  'node:internal/util',
  'node:internal/util/inspect',
]);

function isHashedAsset(filename: string): boolean {
  const stem = filename.slice(0, filename.lastIndexOf('.'));
  if (HASH.test(stem)) return true;
  // Installed Next webpack chunkFilename: [name].[contenthash].js.
  // Only bounded numeric/hex chunk IDs qualify, never arbitrary chunk names.
  const dot = stem.lastIndexOf('.');
  if (dot !== -1)
    return /^(?:\d{1,8}|[a-f0-9]{8})$/i.test(stem.slice(0, dot)) && HASH.test(stem.slice(dot + 1));
  const separator = stem.lastIndexOf('-');
  const prefix = stem.slice(0, separator).toLowerCase();
  return (
    HASH.test(stem.slice(separator + 1)) &&
    (ASSET_PREFIXES.has(prefix) || /^(?:\d{1,8}|[a-f0-9]{8})$/i.test(prefix))
  );
}

function isSafeBuildPath(path: string): boolean {
  if (path.length > 1024 || path.includes(':')) return false;
  // The installed Next SDK replaces the dist directory with _next; retain its exact spelling.
  const buildPath = path.replace(/^\/_next\/server\//, '/.next/server/');
  const match =
    /^\/(_next\/static\/(?:chunks|css)|\.next\/server\/(?:chunks|app|pages))\/(.+)$/.exec(
      buildPath
    );
  if (!match) return false;
  const [, root, tail] = match;
  const segments = tail.split('/');
  const filename = segments.pop() ?? '';
  if (root === '_next/static/css')
    return segments.length === 0 && /^[a-f0-9]{6,64}\.css$/i.test(filename);
  if (!/\.(?:js|mjs)$/i.test(filename)) return false;
  if (root === '.next/server/chunks')
    return segments.length === 0 && (CHUNK_FILE.test(filename) || isHashedAsset(filename));
  if (root.startsWith('_next/')) return isSafeBrowserChunk(segments, filename);
  const stem = filename.slice(0, filename.lastIndexOf('.'));
  if (root === '.next/server/pages') return isSafeServerPage(segments, stem);
  return SERVER_STEMS.has(stem) && isSafeBuildRoute('/' + segments.join('/'));
}

function isSafeServerPage(segments: string[], stem: string): boolean {
  if (segments.length === 0 && ['_app', '_document', '_error'].includes(stem)) return true;
  return isSafeBuildRoute('/' + [...segments, stem].join('/'));
}

function isSafeBrowserChunk(segments: string[], filename: string): boolean {
  if (!isHashedAsset(filename)) return false;
  if (segments.length === 0) return true;
  if (!['app', 'pages'].includes(segments[0])) return false;
  return isSafeBuildRoute('/' + segments.slice(1).join('/'));
}

// Framework runtime files (no app source) keep their package-relative path; the deployment prefix
// before the last node_modules segment (home directories, /var/task) is always discarded.
const RUNTIME_PACKAGE = /^(?:next|react|react-dom|scheduler|@sentry\/[a-z0-9-]{1,40})\//;

function safeRuntimeModulePath(value: string): string | undefined {
  const marker = '/node_modules/';
  const index = value.lastIndexOf(marker);
  if (index === -1) return undefined;
  const tail = value.slice(index + marker.length);
  if (tail.length > 256 || !RUNTIME_PACKAGE.test(tail) || !/^[\w@./-]+\.(?:js|mjs|cjs)$/.test(tail))
    return undefined;
  return `${marker}${tail}`;
}

/** Validate the original spelling before URL parsing can normalize traversal or encoding. */
export function safeBuildStackFilename(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  if (NODE_MODULES.has(value)) return value;
  if (/[\\%\s?#]/.test(value) || /\/\.{1,2}(?:\/|$)/.test(value)) return undefined;
  if (value.startsWith('app:///')) return isSafeBuildPath(value.slice(6)) ? value : undefined;
  if (value.startsWith('/')) return safeRuntimeModulePath(value);
  try {
    const url = parseTelemetryUrl(value);
    if (!['http:', 'https:'].includes(url.protocol)) return undefined;
    if (!url.pathname.startsWith('/_next/static/') || !isSafeBuildPath(url.pathname))
      return undefined;
    return `${safeTelemetryOrigin(url)}${url.pathname}`;
  } catch {
    return undefined;
  }
}
