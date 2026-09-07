import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const ENV = { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' };
export const git = (root, ...args) =>
  execFileSync('/usr/bin/git', ['-C', root, ...args], { env: ENV, encoding: 'utf8' }).trim();

function repository(root) {
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'config', 'user.email', 'bootstrap@example.test');
  git(root, 'config', 'user.name', 'Bootstrap Test');
  git(root, 'remote', 'add', 'origin', 'https://github.com/example/rehearse.git');
  mkdirSync(join(root, 'scripts'));
  writeFileSync(join(root, 'scripts/slice-rehearse-core.mjs'), "import './dependency.mjs';\n");
  writeFileSync(
    join(root, 'scripts/dependency.mjs'),
    "throw new Error('pinned policy dependency loaded');\n"
  );
  writeFileSync(join(root, '.gitignore'), 'ignored.mjs\nignored-editor.txt\n');
  git(root, 'add', '.');
  git(root, 'commit', '-q', '-m', 'fixture policy');
  return root;
}

export function identity(root) {
  return {
    root: realpathSync(root),
    gitDir: realpathSync(git(root, 'rev-parse', '--absolute-git-dir')),
    commonDir: realpathSync(git(root, 'rev-parse', '--path-format=absolute', '--git-common-dir')),
    headSha: git(root, 'rev-parse', 'HEAD'),
    treeSha: git(root, 'rev-parse', 'HEAD^{tree}'),
    branch: git(root, 'rev-parse', '--abbrev-ref', 'HEAD'),
    origin: git(root, 'config', '--get', 'remote.origin.url'),
  };
}

export function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'slice-bootstrap-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const policyRoot = repository(join(root, 'policy'));
  const targetRoot = repository(join(root, 'target'));
  return {
    root,
    policyRoot,
    targetRoot,
    bootstrap: {
      policy: { root: realpathSync(policyRoot), commitSha: git(policyRoot, 'rev-parse', 'HEAD') },
      target: identity(targetRoot),
    },
  };
}

// Real isolated repositories; these receipts are synthetic test authority only.
export async function hostFixture(t) {
  const fs = await import('node:fs');
  const { createHash } = await import('node:crypto');
  const f = fixture(t);
  // Hosted tool-cache binaries may be writable; provision only a private test copy.
  const node = join(realpathSync(f.root), 'node');
  fs.copyFileSync(process.execPath, node, fs.constants.COPYFILE_FICLONE);
  fs.chmodSync(node, 0o700);
  const digest = pathname => createHash('sha256').update(fs.readFileSync(pathname)).digest('hex');
  for (const name of [
    'slice-rehearse-host.mjs',
    'slice-rehearse-bootstrap.mjs',
    'slice-rehearse-canonical.mjs',
    'slice-rehearse.mjs',
  ])
    fs.copyFileSync(new URL(name, import.meta.url), join(f.policyRoot, 'scripts', name));
  git(f.policyRoot, 'add', '.');
  git(f.policyRoot, 'commit', '-q', '-m', 'synthetic host policy');
  git(f.policyRoot, 'checkout', '-q', '--detach');
  const approvalRoot = join(realpathSync(f.root), 'approval');
  mkdirSync(approvalRoot, { mode: 0o700 });
  const loader = join(realpathSync(f.root), 'loader.mjs');
  writeFileSync(
    loader,
    `
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRehearsalHost } from ${JSON.stringify(new URL('file://' + join(f.policyRoot, 'scripts/slice-rehearse-host.mjs')).href)};
import { runTrustedSliceRehearsal } from ${JSON.stringify(new URL('file://' + join(f.policyRoot, 'scripts/slice-rehearse.mjs')).href)};
const [configFile, requestFile, mode] = process.argv.slice(2);
try {
  const config = JSON.parse(fs.readFileSync(configFile));
  const request = JSON.parse(fs.readFileSync(requestFile));
  const errors = [];
  if (mode === 'preloaded-switch') {
    const receipt = config.approvalRoot + '/' + config.receiptName;
    const binding = JSON.parse(fs.readFileSync(receipt));
    fs.appendFileSync(binding.policy.root + '/scripts/slice-rehearse.mjs', String.fromCharCode(10) + '// Changed entrypoint version.' + String.fromCharCode(10));
    const git = args => execFileSync('/usr/bin/git', ['-C', binding.policy.root, ...args], { encoding: 'utf8' }).trim();
    git(['add', 'scripts/slice-rehearse.mjs']);
    git(['commit', '-q', '-m', 'synthetic replacement policy']);
    binding.policy.commitSha = git(['rev-parse', 'HEAD']);
    binding.policy.treeSha = git(['rev-parse', 'HEAD^{tree}']);
    fs.writeFileSync(receipt, JSON.stringify(binding));
    config.receiptSha256 = createHash('sha256').update(fs.readFileSync(receipt)).digest('hex');
  }
  const host = createRehearsalHost({ ...config, stderr: value => errors.push(value) });
  if (mode === 'strict') {
    const code = runTrustedSliceRehearsal(request, host);
    console.log(JSON.stringify({ code, errors }));
  } else {
    const result = host.admit(request);
    if (mode === 'revoke') {
      fs.unlinkSync(config.approvalRoot + '/' + config.receiptName);
      host.admit(request);
    }
    console.log(JSON.stringify({ result, frozen: Object.isFrozen(result) && Object.isFrozen(result.policy) && Object.isFrozen(result.target) }));
  }
} catch (error) { console.log(JSON.stringify({ error: error.message })); process.exitCode = 1; }
`
  );
  const github = ['/opt/homebrew/bin/gh', '/usr/local/bin/gh', '/usr/bin/gh'].find(pathname =>
    fs.existsSync(pathname)
  );
  const file = pathname => ({ path: realpathSync(pathname), sha256: digest(pathname) });
  const anchor = identity(f.targetRoot);
  const record = {
    schemaVersion: 1,
    kind: 'slice-rehearse-host',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    policy: {
      root: realpathSync(f.policyRoot),
      commitSha: git(f.policyRoot, 'rev-parse', 'HEAD'),
      treeSha: git(f.policyRoot, 'rev-parse', 'HEAD^{tree}'),
    },
    target: Object.fromEntries(
      ['root', 'gitDir', 'commonDir', 'origin'].map(key => [key, anchor[key]])
    ),
    loader: file(loader),
    runtime: {
      node: file(node),
      git: file('/usr/bin/git'),
      github: file(github),
      dependencyFiles: [],
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
  };
  const receiptPath = join(approvalRoot, 'synthetic.receipt');
  const configPath = join(f.root, 'config.json');
  const requestPath = join(f.root, 'request.json');
  const request = { cwd: f.targetRoot, manifestPath: 'missing.json' };
  const config = { approvalRoot, receiptName: 'synthetic.receipt', receiptSha256: '' };
  const bind = () => {
    writeFileSync(receiptPath, JSON.stringify(record), { mode: 0o600 });
    config.receiptSha256 = digest(receiptPath);
    writeFileSync(configPath, JSON.stringify(config));
    writeFileSync(requestPath, JSON.stringify(request));
  };
  bind();
  return { ...f, record, request, config, bind, receiptPath, configPath, requestPath, loader };
}
