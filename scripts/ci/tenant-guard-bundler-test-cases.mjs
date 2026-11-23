// Fixtures for the bundler closure suite. The closure builder parses these as data.

import { sha256 } from './tenant-guard/rules-digest.mjs';

export const computedEnvConfig = "export default { env: { ['NEXT_PUBLIC_' + 'REGION']: 'eu' } };";
export const assignedEnvConfig =
  "const env = {}; env['NEXT_PUBLIC_' + 'REGION'] = 'eu'; export default { env };";
const computedObject = "const x = { [('con' + 'structor')]: 1 };";
const substitutedKey = "`con${'structor'}`";
const computedClass = `class X { [${substitutedKey}]() {} }`;

export const grammarAdmissions = [
  ['an ordinary constructor key', 'export default { constructor: 1 };'],
  [
    'numeric and identifier keys and environment reads',
    'const name = "APP_ENV"; export default { [1]: true, [name]: process.env[name] };',
  ],
  ['a concatenated environment key definition', computedEnvConfig],
  ['a concatenated environment key assignment', assignedEnvConfig],
  [
    'a parenthesized element assignment',
    "const env = {}; ((env[`NEXT_PUBLIC_${'REGION'}`])) = 'eu';",
  ],
  ['a parenthesized concatenated object key definition', computedObject],
  ['a substituted class key definition', computedClass],
];

export const grammarRefusals = [
  ['CommonJS require', "require('next-axiom');\n", /loader reference require/u],
  ['an aliased require', 'const load = require;\n', /loader reference require/u],
  ['module.exports', 'module.exports = {};\n', /loader reference module/u],
  ['exports', 'exports.x = 1;\n', /loader reference exports/u],
  ['createRequire', 'createRequire(1);\n', /loader reference createRequire/u],
  ['a dynamic import', "await import('next-axiom');\n", /dynamic import/u],
  ['import.meta', 'const here = import.meta.url;\n', /meta property/u],
  ['eval', "eval('1');\n", /loader reference eval/u],
  ['the Function constructor', "new Function('return 1');\n", /loader reference Function/u],
  ['globalThis', 'globalThis.x = 1;\n', /loader reference globalThis/u],
  ['global', 'global.x = 1;\n', /loader reference global/u],
  ['self', 'self.x = 1;\n', /loader reference self/u],
  ['window', 'window.x = 1;\n', /loader reference window/u],
  [
    'process.getBuiltinModule',
    "process.getBuiltinModule('module');\n",
    /loader member getBuiltinModule/u,
  ],
  ['process.dlopen', 'process.dlopen(1);\n', /loader member dlopen/u],
  ['process.binding', "process.binding('fs');\n", /loader member binding/u],
  ['process as a value', 'const p = process;\n', /process use other than process\.env/u],
  ['process by element', "const e = process['env'];\n", /process use other than process\.env/u],
  ['the constructor escape', "''.constructor.constructor('x');\n", /loader member constructor/u],
  ['a computed constructor', "''['constructor'];\n", /loader member constructor/u],
  ['renamed binding', 'const { constructor: c } = {};\n', /loader member constructor/u],
  ['shorthand binding', 'const { constructor } = {};\n', /loader member constructor/u],
  ['renamed assignment', '({ constructor: c } = {});\n', /loader member constructor/u],
  ['shorthand assignment', '({ constructor } = {});\n', /loader member constructor/u],
  ['a member name in a string', "const k = 'constructor';\n", /loader member constructor/u],
  ['a cooked member name', String.raw`const k = 'con\u0073tructor';`, /loader member constructor/u],
  ['a loader name in a string', "const k = 'require';\n", /loader reference require/u],
  ['a loader name in a template', 'const k = `require`;\n', /loader reference require/u],
  ['a substituted element key', "x[`con${'structor'}`];\n", /computed loader key/u],
  ['a concatenated element key', "x['con' + 'structor'];\n", /computed loader key/u],
  [
    'a compound element assignment',
    "const env = {}; env['con' + 'structor'] += 'x';",
    /computed loader key/u,
  ],
  [
    'an element on the right of an assignment',
    "const env = {}; let x; x = env['con' + 'structor'];",
    /computed loader key/u,
  ],
  ['a computed element deletion', "const env = {}; delete env['a' + 'b'];", /computed loader key/u],
  ['a computed element increment', "const env = {}; env['a' + 'b']++;", /computed loader key/u],
  [
    'a destructuring element target',
    "const env = {}; [env['a' + 'b']] = [];",
    /computed loader key/u,
  ],
  [
    'a destructuring element default',
    "const env = {}; [env['a' + 'b'] = 'x'] = [];",
    /computed loader key/u,
  ],
  [
    'a literal loader key assignment',
    "const env = {}; env['eval'] = 'x';",
    /loader reference eval/u,
  ],
  [
    'a literal loader member assignment',
    "const env = {}; env['constructor'] = 'x';",
    /loader member constructor/u,
  ],
  [
    'a computed parameter key',
    "function f({ ['bin' + 'ding']: label }) {}",
    /computed loader key/u,
  ],
  ['a substituted binding key', "const { [`con${'structor'}`]: c } = {};", /computed loader key/u],
  ['a computed assignment key', "({ ['con' + 'structor']: c } = {});", /computed loader key/u],
  [
    'a read of a computed object key',
    `${computedObject} x[('con' + 'structor')];`,
    /computed loader key/u,
  ],
  [
    'a read of a computed class key',
    `${computedClass} const { [${substitutedKey}]: c } = new X();`,
    /computed loader key/u,
  ],
  ['a literal computed member', "const x = { ['require']: 1 };", /loader member require/u],
  [
    'a literal computed class member',
    "class X { ['constructor']() {} }",
    /loader member constructor/u,
  ],
  ['__proto__', '({}).__proto__;\n', /loader member __proto__/u],
  [
    'import attributes',
    "import data from './data.mjs' with { type: 'json' };\n",
    /import attributes/u,
  ],
  ['import-equals', "import fs = require('fs');\n", /unparseable closure file|import-equals/u],
];

export const externalRefusals = [
  ['a builtin', 'fs', /builtin fs/u],
  ['a builtin subpath', 'fs/promises', /builtin fs\/promises/u],
  ['a node: specifier', 'node:module', /unsupported specifier node:module/u],
  ['module register', 'module', /builtin module/u],
  ['an app alias', '@/lib/helper.mjs', /unsupported specifier/u],
  ['a workspace package', '@interdomestik/web/x', /workspace package/u],
  ['an imports map entry', '#internal', /unsupported local specifier|unsupported specifier/u],
  ['a URL', 'data:text/javascript,1', /unsupported specifier/u],
];

export const localRefusals = [
  ['a percent escape', './src/lib/build%20settings.mjs', /unsupported local specifier/u],
  ['a space', './src/lib/build settings.mjs', /unsupported local specifier/u],
  ['a query', './src/lib/helper.mjs?x', /unsupported local specifier/u],
  ['a non-.mjs target', './src/lib/helper.js', /unsupported local specifier/u],
  ['a JSON target', './src/lib/data.json', /unsupported local specifier/u],
  ['a directory import', './src/lib', /unsupported local specifier/u],
  ['a mid-path ..', './src/../src/lib/helper.mjs', /unsupported local specifier/u],
  ['a missing target', './src/lib/missing.mjs', /missing local target/u],
  ['a target outside the repository', '../../../outside.mjs', /missing local target/u],
  [
    'a config import',
    './next.config.mjs',
    /bundler config imported by apps\/web\/next\.config\.mjs/u,
  ],
];

export function invalidBundlerLinks({ files, edges, scopes }) {
  const [[file, digest]] = files;
  const orphan = 'orphan.mjs';
  const peer = 'peer.mjs';
  const generatedConfig = 'tools/fixtures/dist/next.config.mjs';
  const generatedHelper = 'tools/fixtures/dist/helper.mjs';
  const local = edges.find(
    ([importer, specifier]) =>
      importer === 'apps/web/next.config.mjs' && specifier === './src/lib/supabase-deployment.mjs'
  );
  const external = edges.find(([, specifier]) => !specifier.startsWith('.'));
  const retarget = (edge, target) =>
    edges.map(row => (row === edge ? [row[0], row[1], target] : row));
  const changeSpecifier = specifier =>
    edges.map(row => (row === local ? [row[0], specifier, row[2]] : row));
  const addFiles = (...paths) => ({
    files: [...files, ...paths.map(path => [path, digest])],
    scopes: [...scopes, ...paths.map(path => [path, null, null])],
  });
  return {
    'missing scopes': { scopes: [] },
    'duplicate scope importer': { scopes: [...scopes, [file, null, null]] },
    'mismatched external target': { edges: retarget(external, 'external:wrong') },
    'external edge to a file': { edges: retarget(external, file) },
    'local edge to a missing file': { edges: retarget(local, 'missing.mjs') },
    'local edge to an external target': { edges: retarget(local, `external:${local[1]}`) },
    'duplicate file path': { files: [...files, [file, sha256(digest)]] },
    'edge from a non-file importer': { edges: [...edges, ['unknown.mjs', local[1], local[2]]] },
    'orphan file': addFiles(orphan),
    'local specifier with the wrong recorded target': {
      edges: changeSpecifier('./src/lib/other.mjs'),
    },
    'unsupported local specifier with the same normalized target': {
      edges: changeSpecifier('./src/../src/lib/supabase-deployment.mjs'),
    },
    'normalized local target outside the repository': {
      ...addFiles('../outside.mjs'),
      edges: [...edges, [local[0], '../../../outside.mjs', '../outside.mjs']],
    },
    'disconnected self-import': {
      ...addFiles(orphan),
      edges: [...edges, [orphan, './orphan.mjs', orphan]],
    },
    'disconnected cycle': {
      ...addFiles(orphan, peer),
      edges: [...edges, [orphan, './peer.mjs', peer], [peer, './orphan.mjs', orphan]],
    },
    'config import': {
      edges: [...edges, [local[0], './next.config.mjs', local[0]]],
    },
    'excluded config without incoming edges': addFiles(generatedConfig),
    'cycle rooted at an excluded config': {
      ...addFiles(generatedConfig, generatedHelper),
      edges: [
        ...edges,
        [generatedConfig, './helper.mjs', generatedHelper],
        [generatedHelper, './next.config.mjs', generatedConfig],
      ],
    },
  };
}
