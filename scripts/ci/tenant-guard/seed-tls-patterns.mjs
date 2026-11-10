// Conservative intersection for two finite glob patterns. Needed when an alias key contains
// an unconstrained * (its target is constant); choosing one example spelling would miss aliases.
export function patternsOverlap(left, right) {
  const pending = [[0, 0]];
  const seen = new Set();
  while (pending.length) {
    const [i, j] = pending.pop();
    const key = `${i}:${j}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (seen.size > 20000) throw new Error('incomplete: seed alias pattern bound exceeded');
    if (i === left.length && j === right.length) return true;
    const a = left[i],
      b = right[j];
    if (a === '*') pending.push([i + 1, j]);
    if (b === '*') pending.push([i, j + 1]);
    if (a !== undefined && b !== undefined) {
      if (a === '*' && b !== '*') pending.push([i, j + 1]);
      else if (b === '*' && a !== '*') pending.push([i + 1, j]);
      else if (a === b && a !== '*') pending.push([i + 1, j + 1]);
    }
  }
  return false;
}
