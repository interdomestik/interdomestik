// Untrusted CI job only. Never import or execute this entry in the protected producer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { P2_SOURCES } from './source-fence.mjs';
import { expectedCoverageFiles, parseUntrustedJSON } from './ordinary-artifact.mjs';
const reporters = [
  '--coverage.reporter=text',
  '--coverage.reporter=json',
  '--coverage.reporter=html',
  '--coverage.reporter=lcov',
  '--coverage.reporter=json-summary',
];
const repo = path.resolve(import.meta.dirname, '../../..');
export function renderOrdinaryConfig(root) {
  return `import base from ${JSON.stringify(pathToFileURL(path.join(root, 'apps/web/vitest.config.ts')).href)};\nimport {p2SourceFence} from ${JSON.stringify(pathToFileURL(path.join(repo, 'scripts/ci/p2/source-fence.mjs')).href)};\nexport default {...base,plugins:[p2SourceFence(${JSON.stringify(root)}),...(base.plugins??[])],test:{...base.test,exclude:[...(base.test.exclude??[]),${P2_SOURCES.map(file => JSON.stringify(file.slice('apps/web/'.length))).join(',')}]}};\n`;
}
async function child(args) {
  const p = spawn('pnpm', args, { cwd: repo, env: process.env, stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => {
    p.once('error', reject);
    p.once('close', resolve);
  });
  if (code !== 0) throw Error('Ordinary coverage failed');
}
export async function runOrdinaryCoverageJob() {
  if (process.env.GITHUB_EVENT_NAME !== 'pull_request')
    throw Error('P2 ordinary partition is pull_request only; push uses existing feedback route');
  if (process.env.GITHUB_ACTIONS !== 'true')
    throw Error('Separate ordinary GitHub job only; local commands unchanged');
  const git = args => execFileSync('/usr/bin/git', args, { cwd: repo, encoding: 'utf8' }).trim();
  const commit = git(['rev-parse', 'HEAD']),
    tree = git(['rev-parse', 'HEAD^{tree}']);
  if (
    commit !== process.env.GITHUB_SHA ||
    process.env.GITHUB_REPOSITORY !== 'interdomestik/interdomestik'
  )
    throw Error('Ordinary exact event checkout');
  const config = path.join(repo, 'p2-ordinary-' + randomUUID() + '.config.mjs');
  fs.writeFileSync(config, renderOrdinaryConfig(repo), { flag: 'wx' });
  try {
    execFileSync(process.execPath, [path.join(repo, 'scripts/ci/clean-coverage-artifacts.mjs')], {
      cwd: repo,
      stdio: 'inherit',
    });
    await child([
      '--filter',
      '@interdomestik/web',
      'exec',
      'vitest',
      'run',
      '--config',
      config,
      '--coverage',
      '--pool=threads',
      '--maxWorkers=2',
      '--testTimeout=10000',
      ...reporters,
    ]);
    await child([
      '--filter',
      '@interdomestik/shared-auth',
      'test:unit',
      '--coverage',
      ...reporters,
    ]);
    await child(['--filter', '@interdomestik/domain-*', 'test:unit', '--coverage', ...reporters]);
  } finally {
    fs.unlinkSync(config);
  }
  if (
    git(['rev-parse', 'HEAD']) !== commit ||
    git(['rev-parse', 'HEAD^{tree}']) !== tree ||
    git(['diff', '--name-only', 'HEAD', '--'])
  )
    throw Error('Ordinary source changed');
  const event = JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const head =
    process.env.GITHUB_EVENT_NAME === 'pull_request' ? event.pull_request.head.sha : commit;
  const output = path.join(repo, 'tmp/p2-ordinary-artifact');
  fs.mkdirSync(output, { recursive: true });
  if (fs.readdirSync(output).length) throw Error('Fresh ordinary artifact directory required');
  const domains = fs
    .readdirSync(path.join(repo, 'packages'))
    .filter(name => /^domain-[a-z0-9-]+$/u.test(name));
  const expected = expectedCoverageFiles(domains);
  for (const file of expected.filter(f => f !== 'ordinary-context.json')) {
    const target = path.join(output, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const value = parseUntrustedJSON(fs.readFileSync(path.join(repo, file)));
    if (file.endsWith('/coverage-final.json')) {
      const relative = {};
      for (const [source, row] of Object.entries(value)) {
        const name = path.relative(repo, source);
        if (name.startsWith('../') || path.isAbsolute(name) || row.path !== source)
          throw Error('Foreign ordinary coverage source');
        relative[name] = { ...row, path: name };
      }
      fs.writeFileSync(target, JSON.stringify(relative) + '\n');
    } else if (file === 'apps/web/coverage/coverage-summary.json') {
      const relative = { total: value.total };
      for (const [source, row] of Object.entries(value)) {
        if (source === 'total') continue;
        const name = path.relative(repo, source);
        if (name.startsWith('../') || path.isAbsolute(name))
          throw Error('Foreign ordinary coverage summary source');
        relative[name] = row;
      }
      fs.writeFileSync(target, JSON.stringify(relative) + '\n');
    } else fs.writeFileSync(target, JSON.stringify(value) + '\n');
  }
  fs.writeFileSync(
    path.join(output, 'ordinary-context.json'),
    JSON.stringify({
      version: 1,
      repository: 'interdomestik/interdomestik',
      eventName: process.env.GITHUB_EVENT_NAME,
      runId: Number(process.env.GITHUB_RUN_ID),
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      candidateCommit: commit,
      candidateTree: tree,
      headCommit: head,
      excludedSources: [...P2_SOURCES],
      coverageThresholdPendingProtectedMerge: true,
    }) + '\n'
  );
  // No threshold or native admission success is emitted here. The protected
  // required aggregate runs the unchanged 60% threshold after actual P2 merge.
  console.log(
    JSON.stringify({
      artifactPrepared: true,
      excludedSources: [...P2_SOURCES],
      requiredCoverageGatePending: true,
      nativeAdmission: false,
    })
  );
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  await runOrdinaryCoverageJob();
