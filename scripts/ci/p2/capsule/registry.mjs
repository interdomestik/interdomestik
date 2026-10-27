// Fixed source-derived pure actual export; no SDK, filesystem or network module is loaded here.
import { assignmentRelayFailure } from './relay.mjs';
const actual = Object.freeze({ assignmentRelayFailure });
const allowed = new Set(['@/server/operations/m4-assignment-relay', 'next/cache']);
const pending = new Map(),
  mocks = new Map();
export const adapter = Object.freeze({
  queueMock(id, importer, factory) {
    if (!allowed.has(id) || pending.has(id) || typeof factory !== 'function')
      throw Error('Unclosed mock registration');
    pending.set(id, factory);
  },
  importActual(id) {
    if (id !== '@/server/operations/m4-assignment-relay') throw Error('No actual module authority');
    return actual;
  },
  getMockContext() {
    return { callstack: [] };
  },
});
export async function materializeMocks() {
  if (pending.size !== 2) throw Error('Expected two source mocks');
  for (const [id, factory] of pending) mocks.set(id, await factory());
}
export function getMock(id) {
  if (!mocks.has(id)) throw Error('Module outside closed mock registry');
  return mocks.get(id);
}
