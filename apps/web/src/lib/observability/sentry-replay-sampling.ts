/** Sampling cannot start capture when a bounded draw is unavailable. */
export function sampleReplay(rate: number): boolean {
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1) return false;
  if (rate === 1) return true;
  try {
    const draw = new Uint32Array(1);
    globalThis.crypto.getRandomValues(draw);
    return draw[0] / 2 ** 32 < rate;
  } catch {
    return false;
  }
}
