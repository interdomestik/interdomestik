// Pure parsing for the advisory pre-push selector (contract-test-affected.mjs): the shell and
// Python tokenizer the input closure uses, and the validation of a raw `git diff -z` stream.

// The same in the code of a shell or Python helper (strings and comments removed).
const TEXT_SCANNER =
  /\bgit\s+ls-files\b|\bos\.(?:walk|listdir|scandir)\b|\b(?:i?glob|rglob|iterdir)\(/u;
// Listing words anywhere (strings and comments included): a file that is not a certain scanner but
// matches is uncertain, and its own directory literals become pinned inputs (fail safe).
const LISTING_TEXT = /ls-files|\bos\.(?:walk|listdir|scandir)\b|\b(?:i?glob|rglob|iterdir)\b/u;
// Separators between candidate paths in a non-JavaScript script.
const TEXT_SEPARATORS = /[\s"'`=,;:()[\]{}<>|&$]+/u;

export function stripLeadingSlashes(text) {
  let start = 0;
  while (text[start] === '/') start += 1;
  return text.slice(start);
}

// Where a quoted string ends: the closing quote (three of them for a Python triple-quoted
// string), skipping backslash escapes except inside shell single quotes.
function closingQuote(source, start, quote, python) {
  const triple = python && source.startsWith(quote.repeat(3), start);
  const close = triple ? quote.repeat(3) : quote;
  const escapes = python || quote === '"';
  let index = start + close.length;
  while (index < source.length && !source.startsWith(close, index)) {
    index += escapes && source[index] === '\\' ? 2 : 1;
  }
  return { body: source.slice(start + close.length, index), end: index + close.length };
}

// A shell or Python source split into its quoted strings and its code (strings replaced by a
// space, comments removed). Quotes are tracked across lines (multiline strings, docstrings), a
// backslash escapes the next character, and `#` starts a comment only outside strings, at the
// start of a line or after whitespace.
function splitSource(source, python) {
  const strings = [];
  let code = '';
  for (let index = 0; index < source.length;) {
    const char = source[index];
    if (char === '\\') {
      code += source.slice(index, index + 2);
      index += 2;
    } else if (char === '"' || char === "'") {
      const { body, end } = closingQuote(source, index, char, python);
      strings.push({ body, start: index, end });
      code += ' ';
      index = end;
    } else if (char === '#' && (index === 0 || /\s/u.test(source[index - 1]))) {
      const newline = source.indexOf('\n', index);
      index = newline === -1 ? source.length : newline;
    } else {
      code += char;
      index += 1;
    }
  }
  return { code, quoted: strings.map(text => text.body), listing: gitListing(source, strings) };
}

// Only spaces, tabs and commas on one line: the gap between two items of one argument list.
const isListGap = gap => !/[^ \t,]/u.test(gap);

// A quoted 'ls-files' right after a quoted 'git' in the same list (`["git", "ls-files"]`,
// `('git' 'ls-files')`) is a Git argument list.
function gitListing(source, strings) {
  return strings.some(
    (text, index) =>
      text.body === 'ls-files' &&
      strings[index - 1]?.body === 'git' &&
      isListGap(source.slice(strings[index - 1].end, text.start))
  );
}

// Shell and Python helpers: each quoted string whole (a path may hold spaces) and split, and the
// words of the code. A listing counts only in code, or as a quoted `ls-files` argument.
export function parseText(file, source) {
  const { code, quoted, listing } = splitSource(source, file.endsWith('.py'));
  const words = [
    ...quoted.flatMap(text => text.split(TEXT_SEPARATORS)),
    ...code.split(TEXT_SEPARATORS),
  ];
  // A quoted `ls-files` counts only as an element of a Git argument list (`["git", "ls-files"]`);
  // elsewhere (an assignment, a message) it is uncertain listing text.
  const scanner = TEXT_SCANNER.test(code) || listing;
  return {
    texts: [...quoted, ...words].map(stripLeadingSlashes),
    scanner,
    uncertain: !scanner && LISTING_TEXT.test(source),
    packages: [],
  };
}

// A diff entry outside the statuses a commit-to-commit diff produces, or without a path, is not
// classifiable: the full commands run.
const KNOWN_STATUS = new Set(['A', 'C', 'D', 'M', 'R', 'T']);
export function unrecognizedEntry(entries) {
  const odd = entries.find(
    entry =>
      !KNOWN_STATUS.has(entry.status) ||
      !entry.file ||
      (['R', 'C'].includes(entry.status) && !entry.oldPath)
  );
  return odd ? `unrecognized diff entry ${odd.status ?? '?'} ${odd.file ?? ''}`.trim() : null;
}

// A raw `git diff --name-status -z` stream that does not parse as status/path records (an unknown
// status, an empty or missing path), before any parser can absorb it into a different shape.
// Git prints a rename or copy score as three digits, 000 to 100.
const RAW_STATUS = /^(?:[ADMT]|[RC](?:0\d\d|100))$/u;
export function rawDiffProblem(output) {
  // Every record ends with a NUL, so the last token is always empty: dropping it unconditionally
  // turns an unterminated stream into a record with a missing path.
  const tokens = output.split('\0');
  tokens.pop();
  for (let index = 0; index < tokens.length;) {
    const status = tokens[index++];
    if (!RAW_STATUS.test(status)) return `unrecognized diff entry ${status || '(empty)'}`;
    const count = /^[RC]/u.test(status) ? 2 : 1;
    const files = tokens.slice(index, index + count);
    index += count;
    if (files.length < count || files.some(file => !file)) {
      return `unrecognized diff entry ${status} with a missing path`;
    }
  }
  return null;
}

// The parsed entries, every changed path (both sides of a rename), and why the diff is not
// classifiable, if it is not.
export function readDiff(raw, parseNameStatus) {
  const problem = rawDiffProblem(raw);
  if (problem) return { entries: [], changed: null, odd: problem };
  const entries = parseNameStatus(raw);
  const changed = [
    ...new Set(entries.flatMap(entry => [entry.file, entry.oldPath].filter(Boolean))),
  ];
  return { entries, changed, odd: unrecognizedEntry(entries) };
}
