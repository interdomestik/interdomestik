function isWhitespace(char) {
  return /\s/.test(char ?? '');
}

function skipWhitespace(value, index) {
  while (index < value.length) {
    if (!isWhitespace(value[index])) break;
    index += 1;
  }
  return index;
}

function readAttributeName(tag, index) {
  const start = index;
  while (index < tag.length && tag[index] && !/[\s=/>]/.test(tag[index])) {
    index += 1;
  }
  return { name: tag.slice(start, index).toLowerCase(), index };
}

function readQuotedValue(tag, index, quote) {
  const start = index + 1;
  const end = tag.indexOf(quote, start);
  if (end === -1) return { value: tag.slice(start), index: tag.length };
  return { value: tag.slice(start, end), index: end + 1 };
}

function readBareValue(tag, index) {
  const start = index;
  while (index < tag.length && !isWhitespace(tag[index]) && tag[index] !== '>') {
    index += 1;
  }
  return { value: tag.slice(start, index), index };
}

function readAttributeValue(tag, index) {
  index = skipWhitespace(tag, index);
  if (tag[index] !== '=') return { value: '', index };
  index = skipWhitespace(tag, index + 1);
  const quote = tag[index];
  if (quote === '"' || quote === "'") return readQuotedValue(tag, index, quote);
  return readBareValue(tag, index);
}

function parseAttributes(tag) {
  const attributes = {};
  let index = tag.search(/\s/);
  if (index === -1) return attributes;
  while (index < tag.length) {
    index = skipWhitespace(tag, index);
    if (index >= tag.length || tag[index] === '>' || tag[index] === '/') break;
    const parsedName = readAttributeName(tag, index);
    if (!parsedName.name) break;
    const parsedValue = readAttributeValue(tag, parsedName.index);
    attributes[parsedName.name] = parsedValue.value;
    index = parsedValue.index;
  }
  return attributes;
}

function findTagEnd(html, index) {
  let quote = null;
  while (index < html.length) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = null;
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === '>') {
      return index;
    }
    index += 1;
  }
  return -1;
}

function isTagBoundary(char) {
  return !char || char === '>' || isWhitespace(char);
}

function findScriptEnd(html, lowerHtml, index) {
  let searchIndex = index;
  while (searchIndex < html.length) {
    const closeStart = lowerHtml.indexOf('</script', searchIndex);
    if (closeStart === -1) return null;
    const afterName = closeStart + '</script'.length;
    if (!isTagBoundary(html[afterName])) {
      searchIndex = afterName;
      continue;
    }
    const closeEnd = findTagEnd(html, afterName);
    if (closeEnd === -1) return null;
    return { contentEnd: closeStart, closeEnd };
  }
  return null;
}

export function scriptInventory(html) {
  const scripts = [];
  const lowerHtml = html.toLowerCase();
  let index = 0;
  let searchIndex = 0;

  while (searchIndex < html.length) {
    const openStart = lowerHtml.indexOf('<script', searchIndex);
    if (openStart === -1) break;
    const afterName = openStart + '<script'.length;
    if (!isTagBoundary(html[afterName]) && html[afterName] !== '/') {
      searchIndex = afterName;
      continue;
    }
    const openEnd = findTagEnd(html, afterName);
    if (openEnd === -1) break;
    const close = findScriptEnd(html, lowerHtml, openEnd + 1);
    if (!close) break;
    const attributes = parseAttributes(html.slice(openStart + 1, openEnd));
    scripts.push({
      index,
      src: attributes.src ?? null,
      nonce: attributes.nonce ?? null,
      async: Object.hasOwn(attributes, 'async'),
      defer: Object.hasOwn(attributes, 'defer'),
      inlineLength: close.contentEnd - openEnd - 1,
      firstParty:
        !attributes.src || attributes.src.startsWith('/_next/') || attributes.src.startsWith('/'),
    });
    index += 1;
    searchIndex = close.closeEnd + 1;
  }

  return scripts;
}

export function summarizeScripts(scripts, expectedNonce) {
  const firstParty = scripts.filter(script => script.firstParty);
  const missingNonce = firstParty.filter(script => script.nonce !== expectedNonce);
  return {
    scriptTagCount: scripts.length,
    firstPartyScriptCount: firstParty.length,
    missingFirstPartyNonceCount: missingNonce.length,
    firstMissingFirstPartyScripts: missingNonce.slice(0, 10),
  };
}
