// Comment stripping for the delivery-contract audit (`strip_comments: true` on a regex check).
const LINE_END = new Set(['\n', '\r', '\u2028', '\u2029']);
// A `/` after one of these (or at the start) begins a regular expression literal, not a division.
const REGEX_BEFORE = new Set([...'(,=:[!&|?{};+-*%<>~^'.split(''), '']);
const REGEX_KEYWORDS =
  /(?:^|[^\w$])(?:return|typeof|case|do|else|in|of|new|delete|void|throw|yield|await)$/u;

function skipQuoted(source, start) {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length && source[i] !== quote && !LINE_END.has(source[i])) {
    i += source[i] === '\\' ? 2 : 1;
  }
  return i + 1;
}

function skipRegex(source, start) {
  let i = start + 1;
  let inClass = false;
  while (i < source.length && !LINE_END.has(source[i])) {
    const char = source[i];
    if (char === '\\') i += 1;
    else if (char === '[') inClass = true;
    else if (char === ']') inClass = false;
    else if (char === '/' && !inClass) break;
    i += 1;
  }
  return i + 1;
}

function regexAllowed(source, i) {
  const before = source.slice(0, i).trimEnd();
  return REGEX_BEFORE.has(before.at(-1) ?? '') || REGEX_KEYWORDS.test(before);
}

// Replaces JavaScript/TypeScript comments with spaces, keeping every line terminator, so that a
// pattern can neither be satisfied nor evaded by comment text. Strings, template text and regular
// expression literals are kept (a `/` after an operator, a bracket or a keyword starts a regular
// expression). `${…}` inside a template is scanned as code.
function lineCommentEnd(source, start) {
  let end = start + 2;
  while (end < source.length && !LINE_END.has(source[end])) end += 1;
  return end;
}

function blockCommentEnd(source, start) {
  const close = source.indexOf('*/', start + 2);
  return close === -1 ? source.length : close + 2;
}

// Template text from `start` (a backtick, or the `}` closing a substitution) to the next backtick or
// `${`; returns its end and whether it opened a substitution.
function templateChunkEnd(source, start) {
  let end = start + 1;
  while (end < source.length && source[end] !== '`' && !source.startsWith('${', end)) {
    end += source[end] === '\\' ? 2 : 1;
  }
  return source.startsWith('${', end) ? [end + 2, true] : [end + 1, false];
}

// One token at `i`: [end, text to emit]. `braces` tracks open `{`, true for a substitution.
function nextToken(source, i, braces) {
  const char = source[i];
  const pair = source.slice(i, i + 2);
  if (pair === '//') {
    const end = lineCommentEnd(source, i);
    return [end, ' '.repeat(end - i)];
  }
  if (pair === '/*') {
    const end = blockCommentEnd(source, i);
    return [end, source.slice(i, end).replaceAll(/[^\n\r\u2028\u2029]/gu, ' ')];
  }
  if (char === '"' || char === "'") {
    const end = skipQuoted(source, i);
    return [end, source.slice(i, end)];
  }
  if (char === '`' || (char === '}' && braces.at(-1) === true)) {
    if (char === '}') braces.pop();
    const [end, opened] = templateChunkEnd(source, i);
    if (opened) braces.push(true);
    return [end, source.slice(i, end)];
  }
  if (char === '/' && regexAllowed(source, i)) {
    const end = skipRegex(source, i);
    return [end, source.slice(i, end)];
  }
  if (char === '{') braces.push(false);
  else if (char === '}') braces.pop();
  return [i + 1, char];
}

export function stripComments(source) {
  const braces = [];
  let out = '';
  for (let i = 0; i < source.length;) {
    const [end, text] = nextToken(source, i, braces);
    out += text;
    i = end;
  }
  return out;
}
