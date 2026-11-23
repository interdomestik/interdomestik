import path from 'node:path';
import ts from 'typescript';

// Static input closure of a contract test, for the advisory pre-push selector
// (contract-test-affected.mjs). It reads only sources: every string literal that names a path
// tracked at HEAD or the merge-base is an input, and every tracked script under scripts/ it names
// is followed. It cannot see paths built at run time, glob patterns or package-name imports; hosted
// CI stays the authority for those.

// Area roots used as path bases, not as scanned sets. As directory inputs they selected about 180
// tests for any change below them.
export const AREA_ROOTS = Object.freeze(['scripts/ci', 'apps/web']);

// A call that enumerates a directory, or `ls-files` passed as a command argument, makes the file a
// scanner. Only parsed calls and arguments count, never comments or prose.
const SCAN_CALLS = new Set([
  'readdirSync',
  'readdir',
  'opendirSync',
  'opendir',
  'globSync',
  'glob',
  'walkSync',
  'walk',
]);
const LS_FILES_COMMAND = /^git\s+ls-files(?:\s|$)/u;
// Calls that run a command: a `git ls-files …` string counts only as their argument.
const SPAWN_CALLEE =
  /^(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|execa|execaSync|git)$/u;
// The same in the code of a shell or Python helper (strings and comments removed).
const TEXT_SCANNER =
  /\bgit\s+ls-files\b|\bos\.(?:walk|listdir|scandir)\b|\b(?:i?glob|rglob|iterdir)\(/u;
// Listing words anywhere (strings and comments included): a file that is not a certain scanner but
// matches is uncertain, and its own directory literals become pinned inputs (fail safe).
const LISTING_TEXT = /ls-files|\bos\.(?:walk|listdir|scandir)\b|\b(?:i?glob|rglob|iterdir)\b/u;
// A workspace package import: its package directory becomes a pinned input.
const WORKSPACE_IMPORT = /^(@interdomestik\/[^/]+)/u;
const JS_SOURCE = /\.(?:[cm]?[jt]s|[jt]sx)$/u;
const SHELL_SOURCE = /\.(?:sh|bash|zsh|py)$/u;
// Separators between candidate paths in a non-JavaScript script.
const TEXT_SEPARATORS = /[\s"'`=,;:()[\]{}<>|&$]+/u;
const RELATIVE = /^\.\.?\//u;
const SUFFIXES = ['', '.mjs', '.js', '.cjs', '.ts', '.mts', '.cts', '/index.mjs', '/index.js'];

// Files and directories tracked at any of the given trees (merge-base and HEAD), so a deleted input
// still resolves for the unchanged test that reads it.
export function inventory(paths) {
  const files = new Set(paths);
  const dirs = new Set();
  for (const file of paths) {
    for (let dir = path.posix.dirname(file); dir !== '.' && !dirs.has(dir);) {
      dirs.add(dir);
      dir = path.posix.dirname(dir);
    }
  }
  return { files, dirs };
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function stripLeadingSlashes(text) {
  let start = 0;
  while (text[start] === '/') start += 1;
  return text.slice(start);
}

const spawnArgument = node =>
  ts.isCallExpression(node.parent) &&
  node.parent.arguments.includes(node) &&
  SPAWN_CALLEE.test(calleeName(node.parent.expression) ?? '');
// `ls-files` as a Git argument (an array element or a spawn argument), or a `git ls-files …`
// command string passed to a spawn: test names, messages and other prose never count.
const listsFiles = node =>
  (node.text === 'ls-files' && (ts.isArrayLiteralExpression(node.parent) || spawnArgument(node))) ||
  (LS_FILES_COMMAND.test(node.text) && spawnArgument(node));

// One shell or Python line: its quoted strings, and its code with the strings and a trailing
// comment removed.
function splitLine(line) {
  const quoted = [];
  let code = '';
  let quote = null;
  let current = '';
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (char === quote) {
        quoted.push(current);
        [current, quote] = ['', null];
      } else current += char;
    } else if (char === '"' || char === "'") {
      [quote, code] = [char, `${code} `];
    } else if (char === '#' && (index === 0 || /\s/u.test(line[index - 1]))) {
      break;
    } else code += char;
  }
  return { code, quoted };
}

// Shell and Python helpers: each quoted string whole (a path may hold spaces) and split, and the
// words of the code. A listing counts only in code, or as a quoted `ls-files` argument.
function parseText(source) {
  const lines = source.split('\n').map(splitLine);
  const quoted = lines.flatMap(line => line.quoted);
  const code = lines.map(line => line.code).join('\n');
  const words = [
    ...quoted.flatMap(text => text.split(TEXT_SEPARATORS)),
    ...code.split(TEXT_SEPARATORS),
  ];
  const scanner = TEXT_SCANNER.test(code) || quoted.includes('ls-files');
  return {
    texts: [...quoted, ...words].map(stripLeadingSlashes),
    scanner,
    uncertain: !scanner && LISTING_TEXT.test(source),
    packages: [],
  };
}

const isModuleCall = node =>
  ts.isCallExpression(node) &&
  (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(node.expression) && node.expression.text === 'require'));

// The specifier of an import or export declaration, or of import()/require() with a literal.
function moduleSpecifier(node) {
  if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
    return ts.isStringLiteralLike(node.moduleSpecifier) ? node.moduleSpecifier.text : null;
  }
  const [first] = isModuleCall(node) ? node.arguments : [];
  return first && ts.isStringLiteralLike(first) ? first.text : null;
}

// The candidate path texts of one source, and whether it scans directories.
export function parseSource(file, source) {
  if (!JS_SOURCE.test(file)) return parseText(source);
  const texts = [];
  const packages = [];
  let scanner = false;
  let uncertain = false;
  const visit = node => {
    const workspace = WORKSPACE_IMPORT.exec(moduleSpecifier(node) ?? '');
    if (workspace) packages.push(workspace[1]);
    if (ts.isStringLiteralLike(node)) {
      texts.push(node.text);
      if (listsFiles(node)) scanner = true;
      else if (node.text.includes('ls-files')) uncertain = true;
    } else if (ts.isIdentifier(node) && SCAN_CALLS.has(node.text)) {
      // A listing function named but not certainly called (passed on, destructured, wrapped).
      uncertain = true;
    }
    if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      texts.push(stripLeadingSlashes(node.text));
    } else if (ts.isCallExpression(node) && SCAN_CALLS.has(calleeName(node.expression))) {
      scanner = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true));
  return { texts, scanner, uncertain: uncertain && !scanner, packages };
}

function stripTrailingSlashes(text) {
  let end = text.length;
  while (end > 0 && text[end - 1] === '/') end -= 1;
  return text.slice(0, end);
}

// `./x` and `../x` resolve from the file; every other literal (including `.github/...`) from the
// repository root. Only tracked paths resolve, so prose never matches.
export function resolveLiteral(file, text, { files, dirs }) {
  if (!text || text.startsWith('/')) return null;
  const relative = RELATIVE.test(text);
  const base = relative ? path.posix.join(path.posix.dirname(file), text) : text;
  const target = stripTrailingSlashes(path.posix.normalize(base));
  if (target.startsWith('..') || target === '.') return null;
  for (const suffix of relative ? SUFFIXES : ['']) {
    if (files.has(target + suffix)) return { kind: 'file', path: target + suffix };
  }
  if (dirs.has(target) && target.includes('/') && !AREA_ROOTS.includes(target)) {
    return { kind: 'dir', path: `${target}/` };
  }
  return null;
}

const followed = file =>
  file.startsWith('scripts/') && (JS_SOURCE.test(file) || SHELL_SOURCE.test(file));

// `read(file)` returns the source at HEAD, or undefined for a path that no longer exists there.
// `tracked.workspace` maps a workspace package name to its directories (itself and its workspace
// dependencies).
export function inputClosure(test, read, tracked) {
  const closure = {
    files: new Set([test]),
    dirs: new Set(),
    pinned: new Set(),
    scanner: false,
    unresolved: null,
  };
  const pending = [test];
  while (pending.length) {
    const file = pending.pop();
    const source = read(file);
    if (source !== undefined) pending.push(...collectInputs(file, source, tracked, closure));
  }
  return closure;
}

// Adds one file's inputs to the closure and returns the newly found scripts to follow.
function collectInputs(file, source, tracked, closure) {
  const { texts, scanner, uncertain, packages } = parseSource(file, source);
  if (scanner) closure.scanner = true;
  for (const name of packages) {
    const dirs = tracked.workspace?.get(name);
    if (dirs) dirs.forEach(dir => closure.pinned.add(`${dir}/`));
    else closure.unresolved ??= `${name} (imported by ${file})`;
  }
  const follow = [];
  for (const text of texts) {
    const hit = resolveLiteral(file, text, tracked);
    if (hit?.kind === 'dir') closure.dirs.add(hit.path);
    if (hit?.kind === 'dir' && uncertain) closure.pinned.add(hit.path);
    if (hit?.kind !== 'file' || closure.files.has(hit.path)) continue;
    closure.files.add(hit.path);
    if (followed(hit.path)) follow.push(hit.path);
  }
  return follow;
}

// S-lite: a test without directory scans matches its file and directory inputs; a scanning test
// matches its file inputs only (its directory reads are covered by the area table instead). Pinned
// directories (workspace packages, directories named by an uncertain listing) always match.
export function touches(closure, changed) {
  const prefixes = [...(closure.pinned ?? []), ...(closure.scanner ? [] : closure.dirs)];
  return changed.find(
    file => closure.files.has(file) || prefixes.some(prefix => file.startsWith(prefix))
  );
}
