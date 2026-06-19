import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function resolveGitSha() {
  try {
    const sha = execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (/^[0-9a-f]{7,40}$/u.test(sha)) return sha;
  } catch {
    // Fall back to env-based commit SHA in containerized CI contexts without git.
  }

  const envSha =
    process.env.GITHUB_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.SOURCE_COMMIT ||
    process.env.COMMIT_SHA;

  const normalizedSha = envSha?.trim();
  return normalizedSha && /^[0-9a-f]{7,40}$/u.test(normalizedSha) ? normalizedSha : 'unknown';
}

function normalizeBillingTestMode(value) {
  return value?.trim() === '1' ? '1' : '0';
}

function normalizeCspNonceMode(value) {
  if (value === undefined || value === 'off') return 'off';
  return value === 'report' || value === 'enforce' ? value : 'off';
}

function stripRouteGroups(relativePath) {
  return relativePath
    .split(path.sep)
    .filter(segment => !/^\(.+\)$/.test(segment))
    .join(path.sep);
}

function aliasRouteGroupClientReferenceManifests(appServerRoot) {
  if (!fs.existsSync(appServerRoot)) {
    return 0;
  }

  let aliasCount = 0;

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('_client-reference-manifest.js')) {
        continue;
      }

      const relativePath = path.relative(appServerRoot, absolutePath);
      const publicRelativePath = stripRouteGroups(relativePath);

      if (publicRelativePath === relativePath) {
        continue;
      }

      const aliasPath = path.join(appServerRoot, publicRelativePath);
      fs.mkdirSync(path.dirname(aliasPath), { recursive: true });
      fs.copyFileSync(absolutePath, aliasPath);
      aliasCount += 1;
    }
  }

  visit(appServerRoot);
  return aliasCount;
}

function syncClientReferenceManifests(sourceRoot, targetRoot) {
  if (!fs.existsSync(sourceRoot) || !fs.existsSync(targetRoot)) {
    return 0;
  }

  let syncCount = 0;

  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }

      if (!entry.isFile() || !entry.name.endsWith('_client-reference-manifest.js')) {
        continue;
      }

      const relativePath = path.relative(sourceRoot, absolutePath);
      const targetPath = path.join(targetRoot, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(absolutePath, targetPath);
      syncCount += 1;
    }
  }

  visit(sourceRoot);
  return syncCount;
}

const gitSha = resolveGitSha();
const billingTestMode = normalizeBillingTestMode(process.env.NEXT_PUBLIC_BILLING_TEST_MODE);
const cspNonceMode = normalizeCspNonceMode(process.env.CSP_NONCE_MODE);
const stamp = {
  gitSha,
  builtAt: new Date().toISOString(),
  publicEnv: {
    NEXT_PUBLIC_BILLING_TEST_MODE: billingTestMode,
  },
  buildEnv: {
    CSP_NONCE_MODE: cspNonceMode,
  },
};
const outDir = path.resolve('.next/standalone');
const outFile = path.join(outDir, '.build-stamp.json');
const buildServerRoot = path.resolve('.next/server/app');
const standaloneServerRoots = [
  path.resolve('.next/standalone/apps/web/.next/server/app'),
  path.resolve('.next/standalone/.next/server/app'),
];
const syncCount = standaloneServerRoots.reduce(
  (count, serverRoot) => count + syncClientReferenceManifests(buildServerRoot, serverRoot),
  0
);
const serverRoots = [buildServerRoot, ...standaloneServerRoots];
const aliasCount = serverRoots.reduce(
  (count, serverRoot) => count + aliasRouteGroupClientReferenceManifests(serverRoot),
  0
);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, `${JSON.stringify(stamp, null, 2)}\n`);

console.log(`[build-stamp] ${outFile} (public/build environment modes recorded)`);
if (syncCount > 0) {
  console.log(`[build-stamp] standalone client reference manifests synced=${syncCount}`);
}
if (aliasCount > 0) {
  console.log(`[build-stamp] route-group client reference manifest aliases=${aliasCount}`);
}
