import { stripCommentsAndStrings as stripSourceCommentsAndStrings } from './source-strip-comments.mjs';

function quoteState(char, quote, escaped) {
  if (!quote) return null;
  if (escaped) return { quote, escaped: false };
  if (char === '\\') return { quote, escaped: true };
  return { quote: char === quote ? null : quote, escaped: false };
}

function isQuote(char) {
  return char === '"' || char === "'" || char === '`';
}

function scanUnquotedChars(source, startIndex, visit) {
  let quote = null;
  let escaped = false;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    const nextQuote = quoteState(char, quote, escaped);
    if (nextQuote) {
      ({ quote, escaped } = nextQuote);
      continue;
    }
    if (isQuote(char)) {
      quote = char;
      continue;
    }
    const result = visit(char, index);
    if (result !== undefined) return result;
  }
}

export function findClosingParen(source, openIndex) {
  let depth = 0;
  const found = scanUnquotedChars(source, openIndex, (char, index) => {
    if (char === '(') depth += 1;
    if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  });
  return found ?? -1;
}

export function splitTopLevelArgs(callText) {
  const args = [];
  let start = 0;
  let depth = 0;
  scanUnquotedChars(callText, 0, (char, index) => {
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) {
      args.push(callText.slice(start, index));
      start = index + 1;
    }
  });
  args.push(callText.slice(start));
  return args;
}

export function stripCommentsAndStrings(source) {
  return stripSourceCommentsAndStrings(source, { preserveTemplateExpressions: true });
}

export function commentText(source) {
  return [...source.matchAll(/\/\/[^\n]*|\/\*[\s\S]*?\*\//gu)].map(match => match[0]).join('\n');
}

export function callSiteWindow(source, start, end) {
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const previousStart = source.lastIndexOf('\n', lineStart - 2) + 1;
  return source.slice(previousStart, end);
}

export function lineNumberForIndex(source, index) {
  return source.slice(0, index).split('\n').length;
}
