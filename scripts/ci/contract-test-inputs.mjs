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
// The same in a shell or Python helper, outside comment lines.
const TEXT_SCANNER =
  /\bgit\s+ls-files\b|\bos\.(?:walk|listdir|scandir)\b|\b(?:i?glob|rglob|iterdir)\(/u;
// A quoted string in a shell or Python helper is one candidate path, spaces included.
const QUOTED = /"([^"\n]*)"|'([^'\n]*)'/gu;
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

const isArgument = node =>
  ts.isArrayLiteralExpression(node.parent) ||
  (ts.isCallExpression(node.parent) && node.parent.arguments.includes(node));
const listsFiles = node =>
  isArgument(node) && (node.text === 'ls-files' || LS_FILES_COMMAND.test(node.text));

// Shell and Python helpers: quoted strings and the words between separators are candidates;
// comment lines are skipped.
function parseText(source) {
  const code = source
    .split('\n')
    .filter(line => !line.trimStart().startsWith('#'))
    .join('\n');
  const quoted = [...code.matchAll(QUOTED)].map(match => match[1] ?? match[2]);
  const words = code.split(TEXT_SEPARATORS);
  return {
    texts: [...quoted, ...words].map(stripLeadingSlashes),
    scanner: TEXT_SCANNER.test(code),
  };
}

// The candidate path texts of one source, and whether it scans directories.
export function parseSource(file, source) {
  if (!JS_SOURCE.test(file)) return parseText(source);
  const texts = [];
  let scanner = false;
  const visit = node => {
    if (ts.isStringLiteralLike(node)) {
      texts.push(node.text);
      if (listsFiles(node)) scanner = true;
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      texts.push(stripLeadingSlashes(node.text));
    } else if (ts.isCallExpression(node) && SCAN_CALLS.has(calleeName(node.expression))) {
      scanner = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true));
  return { texts, scanner };
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
export function inputClosure(test, read, tracked) {
  const closure = { files: new Set([test]), dirs: new Set(), scanner: false };
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
  const { texts, scanner } = parseSource(file, source);
  if (scanner) closure.scanner = true;
  const follow = [];
  for (const text of texts) {
    const hit = resolveLiteral(file, text, tracked);
    if (hit?.kind === 'dir') closure.dirs.add(hit.path);
    if (hit?.kind !== 'file' || closure.files.has(hit.path)) continue;
    closure.files.add(hit.path);
    if (followed(hit.path)) follow.push(hit.path);
  }
  return follow;
}

// S-lite: a test without directory scans matches its file and directory inputs; a scanning test
// matches its file inputs only (its directory reads are covered by the area table instead).
export function touches(closure, changed) {
  const prefixes = closure.scanner ? [] : [...closure.dirs];
  return changed.find(
    file => closure.files.has(file) || prefixes.some(prefix => file.startsWith(prefix))
  );
}

// One word of a package-script step: no whitespace, quoting, expansion, globbing or redirection.
const WORD = /^[\w./:=@,+-]+$/u;

// `pnpm x` and `pnpm run x` both name the package script x; anything else is not a plain link.
function pnpmTarget(words) {
  if (words[0] !== 'pnpm') return null;
  const rest = words[1] === 'run' ? words.slice(2) : words.slice(1);
  return rest.length === 1 && !rest[0].startsWith('-') ? rest[0] : null;
}

// `node <entry> [args]`: the entry and every non-flag argument are closure roots (an argument
// may name a file the entry reads). An argument that escapes the repository is not derivable.
function nodeEntries([tool, entry, ...args]) {
  if (tool !== 'node' || !entry || entry.startsWith('-')) return null;
  const roots = [entry, ...args.filter(arg => !arg.startsWith('-'))].map(arg =>
    path.posix.normalize(arg)
  );
  return roots.some(root => root.startsWith('..') || path.posix.isAbsolute(root)) ? null : roots;
}

function stepEntries(scripts, step, seen, stack) {
  const words = step.trim().split(' ');
  if (!words.every(word => WORD.test(word))) return null;
  const linked = pnpmTarget(words);
  return linked ? commandScripts(scripts, linked, seen, stack) : nodeEntries(words);
}

// The `node` entry points behind a package script, following `pnpm <script>` links. Returns null
// when any `&&` step is not exactly a plain link or `node <entry> [args]` of plain words; the
// caller then falls back to the full commands.
export function commandScripts(scripts, name, seen = new Set(), stack = new Set()) {
  if (stack.has(name) || typeof scripts[name] !== 'string') return null;
  seen.add(name);
  stack.add(name);
  const entries = [];
  for (const step of scripts[name].split('&&')) {
    const found = stepEntries(scripts, step, seen, stack);
    if (!found) return null;
    entries.push(...found);
  }
  stack.delete(name);
  return entries;
}
