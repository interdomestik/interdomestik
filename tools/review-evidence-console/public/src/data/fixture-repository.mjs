import { createApiClient } from './api-client.mjs';
import { createApiFixtureRepository } from './api-fixture-repository.mjs';
import { createJsonFixtureRepository } from './json-fixture-repository.mjs';

export function createFixtureRepository({ client, loadJson } = {}) {
  if (loadJson) return createJsonFixtureRepository(loadJson);
  return createApiFixtureRepository(client ?? createApiClient());
}
