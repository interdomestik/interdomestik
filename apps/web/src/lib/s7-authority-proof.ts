// Synthetic CI authority counterexample. Never merge or mount this draft.
import { db, user } from '@interdomestik/database';

export function syntheticAuthorityCounterexample() {
  return db.select().from(user);
}
