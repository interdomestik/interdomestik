import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const DEPS = Object.freeze({
  typescript: {
    version: '5.9.3',
    integrity:
      'sha512-jl1vZzPDinLr9eUt3J/t7V6FgNEw9QjvBPdysz9KfQDD41fQrC2Y4vKQdiaUpFT4bXlb1RHhLpp8wtm6M5TgSw==',
  },
  postgres: {
    version: '3.4.9',
    integrity:
      'sha512-GD3qdB0x1z9xgFI6cdRD6xu2Sp2WCOEoe3mtnyB5Ee0XrrL5Pe+e4CCnJrRMnL1zYtRDZmQQVbvOttLnKDLnaw==',
  },
  'drizzle-orm': {
    version: '0.45.2',
    integrity:
      'sha512-kY0BSaTNYWnoDMVoyY8uxmyHjpJW1geOmBMdSSicKo9CIIWkSxMIj2rkeSR51b8KAPB7m+qysjuHme5nKP+E5Q==',
  },
});
const PATCH = '1bbddfcf186ca46187baec1f533111cdb8c1bb53a061b8feb02476c5ddae0e8e';
const PATCHED = {
  'src/index.js': '6ecfbdd06384caa9c23a2d5eda3f4cfe2f9da1ffef718db44de9ed076cddee0c',
  'src/connection.js': 'fe0e03101e0df83606f6bcccfcf0c88730785a0ee4430cbb569585e82575e2ba',
  'cjs/src/index.js': 'af6048eb8934a438df19032c828560e2a7d9f1bdf1396e9a7974002cbdec231d',
  'cjs/src/connection.js': 'ecfbf6ab4abe320fe3d28c33928103ee5267e9cd15ecc14a6598c3fb09123e55',
};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const fail = reason => {
  throw new Error('provider runtime materialization refused: ' + reason);
};

// Exact reviewed compiler and runtime packages only. No candidate package manager or hooks.
export async function materializeProviderRuntime({
  sourceRoot,
  outputRoot,
  tarballRoot,
  policy,
  runtimeSourceRoot = sourceRoot,
}) {
  const source = fs.realpathSync(sourceRoot),
    runtimeSource = fs.realpathSync(runtimeSourceRoot),
    output = fs.realpathSync(outputRoot);
  if (
    output === source ||
    output.startsWith(source + path.sep) ||
    output !== path.resolve(outputRoot) ||
    fs.readdirSync(output).length
  )
    fail('output isolation');
  const home = path.join(output, 'home');
  fs.mkdirSync(home, { mode: 0o700 });
  const env = { PATH: '/usr/bin:/bin', HOME: home, LC_ALL: 'C', TZ: 'UTC' };
  const run = (binary, args, cwd = output) =>
    execFileSync(binary, args, {
      cwd,
      env,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
      encoding: 'utf8',
    });
  const archiveRoot = path.join(output, 'archives');
  fs.mkdirSync(archiveRoot);
  const dependencies = {};
  for (const [name, expected] of Object.entries(DEPS)) {
    const input = path.join(tarballRoot, name + '.tgz');
    if (fs.statSync(input).size > 40_000_000) fail('archive size');
    const bytes = fs.readFileSync(input);
    const integrity = 'sha512-' + createHash('sha512').update(bytes).digest('base64');
    if (integrity !== expected.integrity) fail('archive integrity ' + name);
    const archive = path.join(archiveRoot, name + '.tgz');
    fs.writeFileSync(archive, bytes);
    const names = run('/usr/bin/tar', ['-tzf', archive]).split('\n').filter(Boolean);
    if (
      !names.length ||
      names.some(
        file =>
          !file.startsWith('package/') || file.split('/').includes('..') || file.startsWith('/')
      )
    )
      fail('archive path ' + name);
    const kinds = run('/usr/bin/tar', ['-tvzf', archive]).split('\n').filter(Boolean);
    if (kinds.some(line => !/^[d-]/u.test(line))) fail('archive member kind ' + name);
    const stage = path.join(output, 'extract-' + name);
    fs.mkdirSync(stage);
    run('/usr/bin/tar', ['-xzf', archive, '-C', stage, '--no-same-owner', '--no-same-permissions']);
    const root = path.join(stage, 'package');
    function regular(dir) {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        if (item.isDirectory()) regular(path.join(dir, item.name));
        else if (!item.isFile()) fail('nonregular extracted package');
      }
    }
    regular(root);
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
    if (manifest.name !== name || manifest.version !== expected.version)
      fail('package identity ' + name);
    dependencies[name] = { ...expected, root, tarballSha256: sha256(bytes) };
  }
  const patch = fs.readFileSync(path.join(source, 'patches/postgres@3.4.9.patch'));
  if (sha256(patch) !== PATCH) fail('driver patch source');
  const patchFile = path.join(output, 'postgres.patch');
  fs.writeFileSync(patchFile, patch);
  run('/usr/bin/patch', ['-p1', '-t', '-N', '-i', patchFile], dependencies.postgres.root);
  const patchedFiles = {};
  for (const [file, expected] of Object.entries(PATCHED)) {
    const digest = sha256(fs.readFileSync(path.join(dependencies.postgres.root, file)));
    if (digest !== expected) fail('patched driver output ' + file);
    patchedFiles[file] = digest;
  }
  const { default: ts } = await import(
    pathToFileURL(path.join(dependencies.typescript.root, 'lib/typescript.js'))
  );
  if (ts.version !== DEPS.typescript.version) fail('compiler identity');
  const runtime = path.join(output, 'runtime');
  fs.mkdirSync(path.join(runtime, 'node_modules'), { recursive: true });
  fs.writeFileSync(path.join(runtime, 'package.json'), '{"private":true,"type":"module"}\n');
  for (const name of ['postgres', 'drizzle-orm'])
    fs.renameSync(dependencies[name].root, path.join(runtime, 'node_modules', name));
  if (Object.keys(policy.runtimeFiles ?? {}).some(file => Object.hasOwn(policy.files, file)))
    fail('runtime/provider overlap');
  const namedNodeTests = Object.fromEntries(
    Object.entries(policy.namedProof?.files ?? {}).filter(([file]) =>
      [
        'packages/database/test/owned-tenant-transaction.test.ts',
        'packages/database/test/rls-bootstrap.test.ts',
      ].includes(file)
    )
  );
  const compiledFiles = { ...policy.files, ...policy.runtimeFiles, ...namedNodeTests };
  function runtimeTarget(file, specifier) {
    if (!specifier.startsWith('.')) return specifier;
    const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
    const target = [
      base,
      base + '.ts',
      base + '.tsx',
      base + '/index.ts',
      base.endsWith('.js') ? base.slice(0, -3) + '.ts' : '',
    ].find(name => Object.hasOwn(compiledFiles, name));
    if (!target) fail('relative import outside compiled provider ' + file + ' -> ' + specifier);
    const relative = path.posix.relative(
      path.posix.dirname(file),
      target.replace(/\.tsx?$/u, '.js')
    );
    return relative.startsWith('.') ? relative : './' + relative;
  }
  const compiledInputs = {},
    emitted = {};
  for (const [file, expected] of Object.entries(compiledFiles)) {
    const inputRoot = Object.hasOwn(policy.runtimeFiles, file) ? runtimeSource : source;
    const full = path.join(inputRoot, file);
    const stat = fs.lstatSync(full),
      bytes = fs.readFileSync(full);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      fs.realpathSync(full) !== full ||
      (stat.mode & 0o111 ? '100755' : '100644') !== expected.mode ||
      bytes.length !== expected.bytes ||
      sha256(bytes) !== expected.sha256
    )
      fail('provider input ' + file);
    if (!file.endsWith('.ts')) fail('unsupported provider source ' + file);
    const rewrite = context => {
      const visit = node => {
        if (
          ts.isImportDeclaration(node) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          if (node.importClause?.isTypeOnly) return node;
          return ts.factory.updateImportDeclaration(
            node,
            node.modifiers,
            node.importClause,
            ts.factory.createStringLiteral(runtimeTarget(file, node.moduleSpecifier.text)),
            node.attributes
          );
        }
        if (
          ts.isExportDeclaration(node) &&
          node.moduleSpecifier &&
          ts.isStringLiteral(node.moduleSpecifier)
        ) {
          if (node.isTypeOnly) return node;
          return ts.factory.updateExportDeclaration(
            node,
            node.modifiers,
            node.isTypeOnly,
            node.exportClause,
            ts.factory.createStringLiteral(runtimeTarget(file, node.moduleSpecifier.text)),
            node.attributes
          );
        }
        return ts.visitEachChild(node, visit, context);
      };
      return node => ts.visitNode(node, visit);
    };
    const result = ts.transpileModule(bytes.toString('utf8'), {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        verbatimModuleSyntax: false,
        sourceMap: false,
      },
      transformers: { before: [rewrite] },
    });
    if (result.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error))
      fail('transpile diagnostics ' + file);
    const target = path.join(runtime, file.replace(/\.ts$/u, '.js'));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, result.outputText);
    compiledInputs[file] = expected.sha256;
    emitted[path.relative(runtime, target)] = sha256(result.outputText);
  }
  if (policy.namedProof) {
    for (const [file, expected] of Object.entries(policy.namedProof.files)) {
      const full = path.join(source, file),
        bytes = fs.readFileSync(full);
      const stat = fs.lstatSync(full);
      if (
        !stat.isFile() ||
        fs.realpathSync(full) !== full ||
        (stat.mode & 0o111 ? '100755' : '100644') !== expected.mode ||
        bytes.length !== expected.bytes ||
        sha256(bytes) !== expected.sha256
      )
        fail('named proof input ' + file);
      const result = ts.transpileModule(bytes.toString('utf8'), {
        fileName: file,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        reportDiagnostics: true,
      });
      if (result.diagnostics?.some(item => item.category === ts.DiagnosticCategory.Error))
        fail('named proof transpilation ' + file);
      const target = path.join(runtime, 'named-source', file + '.js');
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, result.outputText);
      compiledInputs[file] = expected.sha256;
      emitted[path.relative(runtime, target)] = sha256(result.outputText);
    }
    fs.writeFileSync(path.join(runtime, 'named-proof.json'), JSON.stringify(policy.namedProof));
  }
  return {
    runtime,
    compilerVersion: ts.version,
    dependencies: Object.fromEntries(
      Object.entries(dependencies).map(([name, value]) => [
        name,
        { version: value.version, integrity: value.integrity, tarballSha256: value.tarballSha256 },
      ])
    ),
    patchSha256: PATCH,
    patchedFiles,
    compiledInputs,
    emitted,
    runtimeAdmission: false,
  };
}
