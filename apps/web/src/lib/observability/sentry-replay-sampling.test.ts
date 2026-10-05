import { afterEach, describe, expect, it, vi } from 'vitest';
import { sampleReplay } from './sentry-replay-sampling';

afterEach(() => vi.restoreAllMocks());

describe('bounded Replay sampling', () => {
  it.each([0, -1, 1.01, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects disabled or invalid rate %s without drawing',
    rate => {
      const draw = vi.spyOn(globalThis.crypto, 'getRandomValues');
      expect(sampleReplay(rate)).toBe(false);
      expect(draw).not.toHaveBeenCalled();
    }
  );
  it('honors an explicit capture-all rate without depending on random availability', () => {
    const draw = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => {
      throw Error('unavailable');
    });
    expect(sampleReplay(1)).toBe(true);
    expect(draw).not.toHaveBeenCalled();
  });
  it('selects below the bounded threshold and excludes the maximum draw', () => {
    const draw = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(array => {
      (array as Uint32Array).fill(0);
      return array;
    });
    expect(sampleReplay(0.01)).toBe(true);
    draw.mockImplementation(array => {
      (array as Uint32Array).fill(0xffffffff);
      return array;
    });
    expect(sampleReplay(0.01)).toBe(false);
  });
  it('samples nothing when the platform random source fails', () => {
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => {
      throw Error('unavailable');
    });
    expect(sampleReplay(0.1)).toBe(false);
  });
});
