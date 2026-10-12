// Synthetic CI authority negative control. Never merge or mount this draft.
import { db, user } from '@interdomestik/database';

export function syntheticAuthorityNegativeControl() {
  return db.select().from(user);
}
