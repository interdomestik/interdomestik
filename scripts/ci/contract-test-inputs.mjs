import path from 'node:path';
import ts from 'typescript';

// Static input closure of a contract test, for the advisory pre-push selector
// (contract-test-affected.mjs). It reads only the test sources: every string literal that names a
// tracked path is an input, and every tracked script under scripts/ it names is followed. It
// cannot see paths built at run time, glob patterns or package-name imports; hosted CI stays the
// authority for those.

// Area roots used as path bases, not as scanned sets. As directory inputs they selected about 180
// tests for any change below them.
export const AREA_ROOTS = Object.freeze(['scripts/ci', 'apps/web']);

// A file that enumerates directories or Git paths: its directory reads are not visible in literals.
const SCANNER =
  /\b(?:readdirSync|readdir|opendirSync|opendir|globSync|glob|walkSync|walk)\s*\(|ls-files/u;
const SCRIPT = /\.(?:[cm]?js|ts)$/u;
const RELATIVE = /^\.\.?\//u;
const SUFFIXES = ['', '.mjs', '.js', '.cjs', '.ts', '/index.mjs', '/index.js'];

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

function literalTexts(file, source) {
  const texts = [];
  const visit = node => {
    if (ts.isStringLiteralLike(node)) texts.push(node.text);
    else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
      texts.push(node.text.replace(/^\/+/u, ''));
    }
    ts.forEachChild(node, visit);
  };
  visit(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, false));
  return texts;
}

function stripTrailingSlashes(text) {
  let end = text.length;
  while (end > 0 && text[end - 1] === '/') end -= 1;
  return text.slice(0, end);
}

// `./x` and `../x` resolve from the file; every other literal (including `.github/...`) from the
// repository root.
export function resolveLiteral(file, text, { files, dirs }) {
  if (!text || /\s/u.test(text) || text.startsWith('/')) return null;
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
  if (SCANNER.test(source)) closure.scanner = true;
  const follow = [];
  for (const text of literalTexts(file, source)) {
    const hit = resolveLiteral(file, text, tracked);
    if (hit?.kind === 'dir') closure.dirs.add(hit.path);
    if (hit?.kind !== 'file' || closure.files.has(hit.path)) continue;
    closure.files.add(hit.path);
    if (hit.path.startsWith('scripts/') && SCRIPT.test(hit.path)) follow.push(hit.path);
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
