import assert from 'node:assert/strict';
import test from 'node:test';
import { createRouteCoordinator } from '../public/src/app/route-coordinator.mjs';

test('only the newest deferred route completion may commit', async () => {
  const coordinator = createRouteCoordinator();
  const commits = [];
  let finishFirst;
  let finishSecond;
  const deferred = resolve => new Promise(done => resolve(value => done(value)));
  const firstPromise = deferred(resolve => (finishFirst = resolve));
  const first = coordinator.begin();
  const firstLoad = firstPromise.then(() => coordinator.isCurrent(first) && commits.push('first'));
  const secondPromise = deferred(resolve => (finishSecond = resolve));
  const second = coordinator.begin();
  const secondLoad = secondPromise.then(
    () => coordinator.isCurrent(second) && commits.push('second')
  );
  finishSecond();
  await secondLoad;
  finishFirst();
  await firstLoad;
  assert.deepEqual(commits, ['second']);
});
