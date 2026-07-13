import { createFixtureRepository as createBrowserRepository } from '../public/src/data/fixture-repository.mjs';
import { fixtureCatalog } from '../server/fixtures/catalog.mjs';

const bundledFixtures = new Map([
  ['/data/reviewers.json', fixtureCatalog.reviewers],
  ['/data/assignments.json', fixtureCatalog.assignments],
  ...fixtureCatalog.packets.map(packet => [`/data/packets/${packet.id}.json`, packet]),
]);

export async function defaultJsonLoader(pathname) {
  const value = bundledFixtures.get(pathname);
  return value === undefined ? undefined : structuredClone(value);
}

export function createFixtureRepository(options) {
  return createBrowserRepository(options ?? { loadJson: defaultJsonLoader });
}
