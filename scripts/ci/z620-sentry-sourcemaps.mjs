#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SHA_PATTERN = /^[0-9a-f]{40}$/u;

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(entryPath) : [entryPath];
  });
}

function isClientFile(buildDirectory, filePath) {
  return path.relative(buildDirectory, filePath).split(path.sep)[0] === 'static';
}

function hasAssociatedJavaScript(mapPath) {
  if (fs.existsSync(mapPath.slice(0, -4))) return true;
  const sourceMapReference = `//# sourceMappingURL=${path.basename(mapPath)}`;
  return fs
    .readdirSync(path.dirname(mapPath), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .some(entry =>
      fs
        .readFileSync(path.join(path.dirname(mapPath), entry.name), 'utf8')
        .includes(sourceMapReference)
    );
}

function inspectSourceMap(mapPath) {
  const problems = [];
  try {
    const sourceMap = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    if (sourceMap.version !== 3) problems.push(`invalid_version:${mapPath}`);
    if (!Array.isArray(sourceMap.sources) || sourceMap.sources.length === 0) {
      problems.push(`missing_sources:${mapPath}`);
    }
  } catch {
    problems.push(`invalid_json:${mapPath}`);
  }
  if (mapPath.endsWith('.js.map') && !hasAssociatedJavaScript(mapPath)) {
    problems.push(`missing_asset:${mapPath}`);
  }
  return problems;
}

function inspectJavaScript(files, buildDirectory, releaseSha, validReleaseSha) {
  let exposedClientSourceMappingUrls = 0;
  let jsFilesWithExactRelease = 0;
  for (const filePath of files.filter(candidate => candidate.endsWith('.js'))) {
    const source = fs.readFileSync(filePath, 'utf8');
    if (isClientFile(buildDirectory, filePath) && /\/\/# sourceMappingURL=/u.test(source)) {
      exposedClientSourceMappingUrls += 1;
    }
    if (validReleaseSha && source.includes(releaseSha)) jsFilesWithExactRelease += 1;
  }
  return { exposedClientSourceMappingUrls, jsFilesWithExactRelease };
}

function completenessProblems({
  clientMaps,
  exposedClientSourceMappingUrls,
  jsFilesWithExactRelease,
  maps,
  validReleaseSha,
}) {
  const problems = [];
  if (!validReleaseSha) problems.push('invalid_release_sha');
  if (maps.length === 0) problems.push('missing_source_maps');
  if (clientMaps.length === 0) problems.push('missing_client_source_maps');
  if (exposedClientSourceMappingUrls > 0) problems.push('public_source_map_references');
  if (jsFilesWithExactRelease === 0) problems.push('missing_exact_release');
  return problems;
}

export function validateSentrySourceMaps({ buildDirectory, expectedSha }) {
  const normalizedSha = String(expectedSha ?? '')
    .trim()
    .toLowerCase();
  const validReleaseSha = SHA_PATTERN.test(normalizedSha);
  const files = fs.existsSync(buildDirectory) ? walk(buildDirectory) : [];
  const maps = files.filter(filePath => filePath.endsWith('.map'));
  const clientMaps = maps.filter(
    filePath => isClientFile(buildDirectory, filePath) && filePath.endsWith('.js.map')
  );
  const metrics = inspectJavaScript(files, buildDirectory, normalizedSha, validReleaseSha);
  const problems = maps.flatMap(inspectSourceMap);
  problems.push(
    ...completenessProblems({
      clientMaps,
      maps,
      validReleaseSha,
      ...metrics,
    })
  );

  return {
    status: problems.length === 0 ? 'pass' : 'fail',
    release: normalizedSha,
    mapCount: maps.length,
    clientMapCount: clientMaps.length,
    ...metrics,
    problems,
  };
}

function parseArgs(argv) {
  return Object.fromEntries(
    argv.map(argument => {
      const [key, ...value] = argument.replace(/^--/u, '').split('=');
      return [key, value.join('=') || true];
    })
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const result = validateSentrySourceMaps({
    buildDirectory: path.resolve(String(args['build-dir'] ?? 'apps/web/.next')),
    expectedSha: args.sha ?? process.env.CI_LOCAL_HEAD_SHA ?? process.env.SENTRY_RELEASE,
  });
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (args.output) {
    fs.mkdirSync(path.dirname(path.resolve(String(args.output))), { recursive: true, mode: 0o700 });
    fs.writeFileSync(path.resolve(String(args.output)), serialized, { mode: 0o600 });
  }
  process.stdout.write(serialized);
  if (result.status !== 'pass') process.exitCode = 1;
}
