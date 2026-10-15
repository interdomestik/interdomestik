import { db, user } from '@interdomestik/database';
export function syntheticUnsafeProbe() { return db.select().from(user); }
