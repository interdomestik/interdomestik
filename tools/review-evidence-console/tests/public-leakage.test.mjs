import assert from 'node:assert/strict';
import test from 'node:test';

import { startConsoleServer } from '../server/start.mjs';

async function startServer(t) {
  const server = await startConsoleServer({ port: 0 });
  t.after(() => server.close());
  return `http://127.0.0.1:${server.address().port}`;
}

test('server never exposes reviewer fixtures through public paths', async t => {
  const origin = await startServer(t);
  const paths = [
    '/data/assignments.json',
    '/data/reviewers.mjs',
    '/data/packets/mob-03a-part-a.json',
    '/data/items/m03a-medical-boundary.mjs',
    '/data/items/m03a-threat-recheck.json.map',
  ];

  for (const pathname of paths) {
    const response = await fetch(origin + pathname);
    assert.equal(response.status, 404, pathname);
    assert.doesNotMatch(await response.text(), /assignment|reviewer|packet|medical|threat/i);
  }
});
