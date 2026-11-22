import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { resolveEnvironment } from '../../screen-contract/exports.mjs';

export const requireFromHere = createRequire(import.meta.url);
const ts = requireFromHere('typescript');

export const PKG_NAME = '@fx/pkg';
export const NODE_VERSION = process.version;
export const ALL_ENVS = ['node-import', 'node-require', 'bundler-browser', 'types'];

export function buildFixture(t, exportsField, files) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sc-exports-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pkgDir = path.join(root, 'node_modules', '@fx', 'pkg');
  fs.mkdirSync(pkgDir, { recursive: true });
  const pkg = { name: PKG_NAME, version: '1.0.0', exports: exportsField };
  fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify(pkg, null, 2));
  for (const file of files) {
    const abs = path.join(pkgDir, file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.endsWith('.d.ts') ? 'export {};\n' : 'export default 1;\n');
  }
  const importer = path.join(root, 'importer.mjs');
  fs.writeFileSync(importer, '');
  return { root, pkgDir, importer, pkg };
}

// TypeScript adds the types condition itself; only "resolves, and to which file"
// is compared.
export function typesOracle(fixture, specs) {
  const options = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    allowJs: true,
  };
  return specs.map(spec => {
    const result = ts.resolveModuleName(spec, fixture.importer, options, ts.sys);
    return result.resolvedModule
      ? { resolved: true, file: result.resolvedModule.resolvedFileName }
      : { resolved: false, detail: 'unresolved' };
  });
}

export function subpathOf(spec) {
  return spec === PKG_NAME ? '.' : `.${spec.slice(PKG_NAME.length)}`;
}

export const fileExistsIn = pkgDir => target => {
  const abs = path.join(pkgDir, target);
  return fs.existsSync(abs) && fs.statSync(abs).isFile();
};

export function moduleVerdict(fixture, spec, env) {
  return resolveEnvironment(fixture.pkg, subpathOf(spec), env, fileExistsIn(fixture.pkgDir));
}
