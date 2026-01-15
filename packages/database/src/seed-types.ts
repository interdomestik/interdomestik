/**
 * Seed Types & Config
 */

export type SeedMode = 'e2e' | 'golden' | 'full' | 'workload';

/**
 * Typed configuration passed to all seed packs.
 * This prevents packs from reading process.env or loading .env themselves.
 */
export interface SeedConfig {
  mode: SeedMode;
  seedBaseTime: Date;
  /**
   * Deterministic ordering helper
   * returns a new Date with the given offset from baseTime
   */
  at: (offsetMs?: number) => Date;
}

/**
 * Helper to create a SeedConfig with a deterministic timestamp generator
 */
export function createSeedConfig(mode: SeedMode, seedBaseTime: Date): SeedConfig {
  const baseTimeMs = seedBaseTime.getTime();
  return {
    mode,
    seedBaseTime,
    at: (offsetMs = 0) => new Date(baseTimeMs + offsetMs),
  };
}
