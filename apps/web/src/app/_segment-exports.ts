import type { Metadata, Viewport } from 'next';

// NOTE: This file exists to provide stable, no-op segment exports for wrapper modules
// that re-export from `./_core.entry`. Next's build can attempt to import these
// symbols even when not explicitly used.
//
// Keep these implementations intentionally empty so they do not affect behavior.

export async function generateMetadata(): Promise<Metadata> {
  return {};
}

export async function generateViewport(): Promise<Viewport> {
  return {} as Viewport;
}
