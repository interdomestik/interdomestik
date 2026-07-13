import { createApiClient } from './api-client.mjs';
import { createApiFixtureRepository } from './api-fixture-repository.mjs';
import { createJsonFixtureRepository } from './json-fixture-repository.mjs';

let bundledFixtures;

export async function defaultJsonLoader(pathname) {
  if (!bundledFixtures) {
    const { fixtureCatalog } = await import('../../../server/fixtures/catalog.mjs');
    bundledFixtures = new Map([
      ['/data/reviewers.json', fixtureCatalog.reviewers],
      ['/data/assignments.json', fixtureCatalog.assignments],
      ...fixtureCatalog.packets.map(packet => [`/data/packets/${packet.id}.json`, packet]),
    ]);
  }
  const value = bundledFixtures.get(pathname);
  return value === undefined ? undefined : structuredClone(value);
}

export function createFixtureRepository({ client, loadJson } = {}) {
  if (loadJson) return createJsonFixtureRepository(loadJson);
  if (client) return createApiFixtureRepository(client);
  if (typeof window === 'undefined') return createJsonFixtureRepository(defaultJsonLoader);
  return createApiFixtureRepository(createApiClient());
}
