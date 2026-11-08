import { beforeEach, vi } from 'vitest';
import { resetPaddleHandlerMocks, routeTenantContextToDbMock } from './test-support';

const hoisted = await vi.hoisted(async () => {
  const { createHoistedPaddleHandlerMocks } = await import('./test-support');

  return createHoistedPaddleHandlerMocks();
});
vi.mock('@interdomestik/database', async function () {
  const support = await import('./test-support');
  return support.createPaddleDatabaseMockModule(hoisted);
});
vi.mock('../../commissions/create', async function () {
  const support = await import('./test-support');
  return support.createCommissionMockModule();
});
vi.mock('./dunning-sponsor', () => ({ readPastDueAccessContinues: async () => false }));
vi.mock('@interdomestik/database/member-number', async function () {
  const support = await import('./test-support');
  return support.createMemberNumberMockModule();
});
beforeEach(() => {
  resetPaddleHandlerMocks(hoisted);
  // Dunning persists through standalone tenant-scoped statements (no multi-write transaction).
  routeTenantContextToDbMock(hoisted);
});

export { hoisted };
