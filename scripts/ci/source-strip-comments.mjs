function isQuote(char) {
  return char === '"' || char === "'" || char === '`';
}

function stripLineComment(source, index) {
  let text = '';
  while (index < source.length && source[index] !== '\n') {
    text += ' ';
    index += 1;
  }
  if (index < source.length) text += '\n';
  return { index, text };
}

function stripBlockComment(source, index) {
  let text = '  ';
  index += 2;
  while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) {
    text += source[index] === '\n' ? '\n' : ' ';
    index += 1;
  }
  if (index < source.length) {
    text += '  ';
    index += 1;
  }
  return { index, text };
}

function preserveTemplateExpression(source, index) {
  let text = '  ';
  let depth = 1;
  index += 2;
  while (index < source.length && depth > 0) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') depth -= 1;
    text += depth > 0 ? source[index] : ' ';
    index += 1;
  }
  return { index: index - 1, text };
}

function stripQuotedChar(char, quote, escaped) {
  if (escaped) return { escaped: false, output: char === '\n' ? '\n' : ' ', quote };
  if (char === '\\') return { escaped: true, output: ' ', quote };
  return {
    escaped: false,
    output: char === '\n' ? '\n' : ' ',
    quote: char === quote ? null : quote,
  };
}

export function stripCommentsAndStrings(source, options = {}) {
  const preserveTemplateExpressions = options.preserveTemplateExpressions === true;
  let output = '';
  let quote = null;
  let escaped = false;
  let index = 0;

  while (index < source.length) {
    const char = source[index];
    const next = source[index + 1];
    let replacement = null;

    if (!quote && char === '/' && next === '/') replacement = stripLineComment(source, index);
    else if (!quote && char === '/' && next === '*') replacement = stripBlockComment(source, index);
    else if (preserveTemplateExpressions && quote === '`' && char === '$' && next === '{') {
      replacement = preserveTemplateExpression(source, index);
    }

    if (replacement) {
      output += replacement.text;
      index = replacement.index + 1;
      continue;
    }

    if (quote) {
      const stripped = stripQuotedChar(char, quote, escaped);
      ({ escaped, quote } = stripped);
      output += stripped.output;
      index += 1;
      continue;
    }

    if (isQuote(char)) {
      quote = char;
      output += ' ';
    } else {
      output += char;
    }
    index += 1;
  }

  return output;
}
