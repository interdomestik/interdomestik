function normalizePath(value) {
  return String(value || '')
    .trim()
    .replaceAll('\\', '/');
}

function splitPath(value) {
  const normalized = normalizePath(value);
  return normalized ? normalized.split('/').filter(Boolean) : [];
}

function segmentMatches(value, pattern) {
  let valueIndex = 0;
  let patternIndex = 0;
  let starIndex = -1;
  let fallbackValueIndex = 0;

  while (valueIndex < value.length) {
    if (patternIndex < pattern.length && pattern[patternIndex] === value[valueIndex]) {
      valueIndex += 1;
      patternIndex += 1;
      continue;
    }

    if (patternIndex < pattern.length && pattern[patternIndex] === '*') {
      starIndex = patternIndex;
      patternIndex += 1;
      fallbackValueIndex = valueIndex;
      continue;
    }

    if (starIndex !== -1) {
      patternIndex = starIndex + 1;
      fallbackValueIndex += 1;
      valueIndex = fallbackValueIndex;
      continue;
    }

    return false;
  }

  while (patternIndex < pattern.length && pattern[patternIndex] === '*') {
    patternIndex += 1;
  }

  return patternIndex === pattern.length;
}

function matchSegments(fileSegments, patternSegments, fileIndex = 0, patternIndex = 0) {
  if (patternIndex === patternSegments.length) {
    return fileIndex === fileSegments.length;
  }

  const patternSegment = patternSegments[patternIndex];
  if (patternSegment === '**') {
    if (matchSegments(fileSegments, patternSegments, fileIndex, patternIndex + 1)) {
      return true;
    }
    return fileIndex < fileSegments.length
      ? matchSegments(fileSegments, patternSegments, fileIndex + 1, patternIndex)
      : false;
  }

  if (fileIndex >= fileSegments.length) {
    return false;
  }

  return (
    segmentMatches(fileSegments[fileIndex], patternSegment) &&
    matchSegments(fileSegments, patternSegments, fileIndex + 1, patternIndex + 1)
  );
}

export function matchesGlobPattern(filePath, pattern) {
  return matchSegments(splitPath(filePath), splitPath(pattern));
}
