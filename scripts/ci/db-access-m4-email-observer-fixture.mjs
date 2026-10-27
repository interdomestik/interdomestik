import { openM4EmailObserverChild } from './db-access-m4-email-observer-client.mjs';
import { provisionM4Fixture } from './db-access-m4-runtime-fixture-provision.mjs';

// Called only by the fixed producer parent with its already-owned dependencies.
// The returned no-argument factory cannot select another image, environment or transport.
export function createM4EmailObserverFixtureFactory({
  root,
  postgres,
  serializeSignedCookie,
  adminURL,
}) {
  return async function openObserverFixture() {
    if (arguments.length) throw Error('M4 observer fixture takes no arguments');
    const client = await openM4EmailObserverChild(root);
    let fixture;
    try {
      fixture = await provisionM4Fixture({
        postgres,
        serializeSignedCookie,
        adminURL,
        client,
        profiles: true,
        record: {},
        run: async () => {
          throw Error('Nested M4 case registration refused');
        },
      });
    } catch (error) {
      // provisionM4Fixture already retires its owned setup on failure.
      try {
        await client.close();
      } catch {
        /* original failure remains decisive */
      }
      throw error;
    }
    let retirement;
    return Object.freeze({
      fixture,
      emailUnavailableCount: client.emailUnavailableCount,
      waitForEmailUnavailableCount: client.waitForEmailUnavailableCount,
      finish() {
        // Memoize only fixture teardown. Product runtime.close remains unmodified.
        retirement ??= (async () => {
          let cleanup, child;
          try {
            cleanup = await fixture.cleanup();
          } finally {
            child = await client.close();
          }
          if (!cleanup.complete || cleanup.forcedTermination || cleanup.remainingOwnedSessions)
            throw Error('M4 observer fixture cleanup refused');
          return Object.freeze({ cleanup, child });
        })();
        return retirement;
      },
    });
  };
}
