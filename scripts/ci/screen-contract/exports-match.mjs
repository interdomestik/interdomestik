// PATTERN_KEY_COMPARE for two keys that each hold one `*`.
function patternKeyCompare(keyA, keyB) {
  const baseA = keyA.indexOf('*') + 1;
  const baseB = keyB.indexOf('*') + 1;
  if (baseA !== baseB) return baseA > baseB ? -1 : 1;
  if (keyA.length !== keyB.length) return keyA.length > keyB.length ? -1 : 1;
  return 0;
}

// PACKAGE_IMPORTS_EXPORTS_RESOLVE: returns { target, patternMatch } or null.
function matchSubpath(subpath, map) {
  if (Object.hasOwn(map, subpath) && !subpath.includes('*')) {
    return { target: map[subpath], patternMatch: null };
  }
  const patternKeys = Object.keys(map)
    .filter(key => {
      const star = key.indexOf('*');
      return star !== -1 && star === key.lastIndexOf('*');
    })
    .sort(patternKeyCompare);
  for (const key of patternKeys) {
    const star = key.indexOf('*');
    const base = key.slice(0, star);
    const trailer = key.slice(star + 1);
    if (subpath.startsWith(base) && subpath.length >= key.length && subpath.endsWith(trailer)) {
      return {
        target: map[key],
        patternMatch: subpath.slice(star, subpath.length - trailer.length),
      };
    }
  }
  return null;
}

export { matchSubpath };
