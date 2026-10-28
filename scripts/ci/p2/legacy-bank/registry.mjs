const allowed = new Set([
  '@interdomestik/domain-claims/agent-claims/assign',
  '@/lib/audit',
  '@/lib/notifications',
  'next/cache',
  '@interdomestik/database',
  '@interdomestik/database/tenant-security',
]);
const pending = new Map();
const mocks = new Map();
export const adapter = Object.freeze({
  queueMock(id, importer, factory) {
    if (!allowed.has(id) || pending.has(id) || typeof factory !== 'function')
      throw Error('Unclosed mock registration');
    pending.set(id, factory);
  },
  importActual() {
    throw Error('No actual module authority');
  },
  getMockContext() {
    return { callstack: [] };
  },
});
export async function materializeMocks() {
  if (pending.size !== 6) throw Error('Expected six source mocks');
  for (const [id, factory] of pending) mocks.set(id, await factory());
}
export function getMock(id) {
  if (!mocks.has(id)) throw Error('Module outside closed mock registry');
  return mocks.get(id);
}
