import { sql } from 'drizzle-orm';

import { db } from './db';

export type TenantContext = {
  tenantId: string;
  role?: string | null;
};

type DbTransaction = Parameters<typeof db.transaction>[0] extends (tx: infer T) => Promise<unknown>
  ? T
  : never;

export async function withTenantContext<T>(
  context: TenantContext,
  action: (tx: DbTransaction) => Promise<T>
): Promise<T> {
  return db.transaction(async tx => {
    await tx.execute(sql`set local app.current_tenant_id = ${context.tenantId}`);
    if (context.role) {
      await tx.execute(sql`set local app.user_role = ${context.role}`);
    }
    return action(tx);
  });
}
