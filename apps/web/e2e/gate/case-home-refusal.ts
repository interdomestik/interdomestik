import { expect } from '@playwright/test';

// A case child must carry its case's home tenant (migration case_tenant_binding). Fixtures that
// once seeded a cross-tenant child as an adversarial control now prove the database refuses it.
export async function expectCaseHomeRefusal(write: PromiseLike<unknown>, constraint: string) {
  await expect(Promise.resolve(write)).rejects.toMatchObject({
    cause: { code: '23503', constraint_name: constraint },
  });
}
