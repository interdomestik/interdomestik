// Explicit spelling of the default Array.prototype.sort comparison for the guard's actual signature
// domains: strings, arrays of strings and nested location tuples (ToString joins the WHOLE element
// with commas), and undefined. Both sides are converted with String() and related by UTF-16 code
// units, exactly like the default SortCompare. There is no locale, numeric, prefix or tie-breaking
// order: equal strings return 0, so the stable sort keeps their input order. Array.prototype.sort
// never passes undefined elements or holes to a comparator; they stay last. This is not a generic
// equivalence claim for Symbols or objects with side-effecting conversions.
export function compareCodeUnits(left, right) {
  const a = String(left);
  const b = String(right);
  return Number(a > b) - Number(a < b);
}
