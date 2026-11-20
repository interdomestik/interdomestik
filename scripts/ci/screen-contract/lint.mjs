// The lint run of the screen-contract checks (WP-05 design §3): ESLint's Node API with the dedicated
// config of the scanner's own checkout, cwd = the target tree, inline config off, and a
// reconciliation of every expected file and rule. Its output is items and coverage units per check.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';
import { roleOf } from './roles.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCANNER_ROOT = path.resolve(HERE, '../../..');
export const CONFIG_PATH = 'apps/web/eslint.screen-contract.config.mjs';
const WEB_REQUIRE = createRequire(path.join(SCANNER_ROOT, 'apps/web/package.json'));
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage', '.git']);
const SOURCE_RE = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/u;
const KEY_RE = /^⟦([^⟧]+)⟧ /u;

export const LOCAL_RULE_OF = Object.freeze({
  'CHK-15c': 'screen-contract/no-database-import',
  'CHK-15b': 'screen-contract/exports-resolution',
  'CHK-15a': 'screen-contract/layer-order',
  'CHK-09': 'screen-contract/no-adhoc-format',
  'CHK-22': 'screen-contract/consent-control-registered',
  A11Y: 'screen-contract/labelled-control',
});

// The files a check expects in its results (design §2 "Reads").
export const EXPECTS = Object.freeze({
  'CHK-15c': role => role === 'screen',
  'CHK-09': role => role === 'screen',
  A11Y: role => role === 'screen',
  'CHK-22': (role, rel) =>
    role === 'screen' || (role === 'support' && rel.startsWith('packages/ui/src/')),
  'CHK-15b': role => role !== null && role !== 'test',
  'CHK-15a': role => role !== null && role !== 'test',
});

// Every classified, non-test source file of the target tree, sorted.
export function linted(root) {
  const out = [];
  const walk = rel => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return;
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (SOURCE_RE.test(entry.name)) {
        const role = roleOf(child);
        if (role !== null && role !== 'test') out.push(child);
      }
    }
  };
  walk('apps/web/src');
  const packages = path.join(root, 'packages');
  if (fs.existsSync(packages))
    for (const name of fs.readdirSync(packages).sort(byCodeUnit)) walk(`packages/${name}/src`);
  return out.sort(byCodeUnit);
}

async function loadEslint() {
  try {
    return (await import(pathToFileURL(WEB_REQUIRE.resolve('eslint')).href)).ESLint;
  } catch (error) {
    throw new ScanError(`ESLint is not loadable: ${error?.message ?? error}`);
  }
}

const severityOf = value => (Array.isArray(value) ? value[0] : value);
const isError = value => severityOf(value) === 2 || severityOf(value) === 'error';

// The rules each check needs enabled at `error`, from the loaded config's exports.
export async function ruleSets(configFile = path.join(SCANNER_ROOT, CONFIG_PATH)) {
  let config;
  try {
    config = await import(pathToFileURL(configFile).href);
  } catch (error) {
    throw new ScanError(`the screen-contract config is not loadable: ${error?.message ?? error}`);
  }
  const a11y = Object.keys(config.A11Y_RULES ?? {});
  if (!a11y.length) throw new ScanError('the screen-contract config enables no jsx-a11y rule');
  const sets = Object.fromEntries(Object.entries(LOCAL_RULE_OF).map(([id, name]) => [id, [name]]));
  sets.A11Y = [...a11y, LOCAL_RULE_OF.A11Y].sort(byCodeUnit);
  return sets;
}

// The JSX element a message is reported on (its own opening tag, or the nearest one before it,
// when the rule reports an attribute), for an A11Y item key.
function elementAt(lines, message) {
  const before = [
    ...lines.slice(0, message.line - 1),
    lines[message.line - 1]?.slice(0, message.column - 1) ?? '',
  ].join('\n');
  const rest = lines[message.line - 1]?.slice(Math.max(0, message.column - 1)) ?? '';
  const own = /^<\s*([A-Za-z_$][\w.$-]*)/u.exec(rest)?.[1];
  if (own) return own;
  const opens = [...before.matchAll(/<([A-Za-z_$][\w.$-]*)/gu)];
  return opens.length ? opens[opens.length - 1][1] : '?';
}

// Each expected check of the file counts it, and needs its rules enabled at `error` there.
function checkRulesEnabled(out, sets, role, rel, fileConfig) {
  for (const [id, rules] of Object.entries(sets)) {
    if (!EXPECTS[id](role, rel)) continue;
    out[id].files += 1;
    for (const name of rules)
      if (!isError(fileConfig.rules?.[name]))
        throw new ScanError(`${name} is not enabled at error for ${rel}`);
  }
}

const sourceLines = (root, rel, result) =>
  result.source === undefined
    ? fs.readFileSync(path.join(root, rel), 'utf8').split('\n')
    : result.source.split('\n');

// A keyed message of a local rule: a coverage-unit count, or an item of the check it names.
function collectKeyed(out, rel, message, keyed) {
  const key = keyed[1];
  if (key.startsWith('#unit|')) {
    const [, check, kind, n] = key.split('|');
    out[check].units[kind] = (out[check].units[kind] ?? 0) + Number(n);
    return;
  }
  const check = key.split('|')[0];
  if (!out[check]) throw new ScanError(`${rel}: a lint message names an unknown check ${check}`);
  out[check].items.push({
    id: key,
    file: rel,
    line: message.line,
    message: message.message.slice(keyed[0].length),
  });
}

function collectMessage(out, { rel, role, lines }, message) {
  if (message.fatal || !message.ruleId)
    throw new ScanError(
      `${rel}: ${message.fatal ? 'fatal' : 'unattributed'} lint message: ${message.message}`
    );
  const keyed = KEY_RE.exec(message.message);
  if (keyed) collectKeyed(out, rel, message, keyed);
  else if (message.ruleId.startsWith('jsx-a11y/')) {
    if (role !== 'screen') return;
    const key = `A11Y|${rel}|${message.ruleId}|${elementAt(lines, message)}`;
    out.A11Y.items.push({ id: key, file: rel, line: message.line, message: message.message });
  } else throw new ScanError(`${rel}: an unexpected lint message from ${message.ruleId}`);
}

// The config of each file, computed together; a failure is rethrown at its file, in file order.
const fileConfigs = (eslint, root, files) =>
  Promise.all(
    files.map(async rel => {
      try {
        return { config: await eslint.calculateConfigForFile(path.join(root, rel)) };
      } catch (error) {
        return { error };
      }
    })
  );

// Runs the lint over `files` of `root` and returns { items, units } per check id.
export async function lintTree(root, files, { configFile } = {}) {
  if (!files.length) throw new ScanError('the expected file list is empty');
  const config = configFile ?? path.join(SCANNER_ROOT, CONFIG_PATH);
  const sets = await ruleSets(config);
  const ESLint = await loadEslint();
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: config,
    allowInlineConfig: false,
    errorOnUnmatchedPattern: true,
    warnIgnored: true,
    cache: false,
  });
  let results;
  try {
    results = await eslint.lintFiles(files.map(rel => path.join(root, rel)));
  } catch (error) {
    throw new ScanError(`ESLint failed: ${error?.message ?? error}`);
  }
  const byFile = new Map(
    results.map(result => [path.relative(root, result.filePath).split(path.sep).join('/'), result])
  );
  const out = Object.fromEntries(
    Object.keys(sets).map(id => [id, { items: [], units: {}, files: 0 }])
  );
  const configs = await fileConfigs(eslint, root, files);
  files.forEach((rel, index) => {
    const result = byFile.get(rel);
    if (!result) throw new ScanError(`${rel} is missing from the lint results`);
    const role = roleOf(rel);
    const { config: fileConfig, error } = configs[index];
    if (error) throw error;
    if (!fileConfig) throw new ScanError(`${rel} is ignored by the screen-contract config`);
    checkRulesEnabled(out, sets, role, rel, fileConfig);
    const file = { rel, role, lines: sourceLines(root, rel, result) };
    for (const message of result.messages) collectMessage(out, file, message);
  });
  if (byFile.size !== files.length)
    throw new ScanError('the lint results name files that were not expected');
  for (const result of out.A11Y ? [out.A11Y] : []) result.units.file = result.files;
  return out;
}
