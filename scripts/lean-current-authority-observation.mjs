import { AsyncLocalStorage } from 'node:async_hooks';
import { isDeepStrictEqual } from 'node:util';

const remoteObservation = new AsyncLocalStorage();
export function readObserved(endpoint, repo, read) {
  const observation = remoteObservation.getStore();
  return observation ? observation.read(endpoint, repo) : read(endpoint, repo);
}

// Invocation-local read consistency, not an atomic snapshot or effect authorization.
export function observeRemoteReads(repo, collect, read) {
  if (remoteObservation.getStore()) throw new Error('remote observation cannot nest');
  const records = new Map();
  let total = 0,
    failure,
    closed = false;
  const fail = () => {
    throw (failure ??= new Error('remote observation unavailable or changed'));
  };
  const capture = endpoint => {
    try {
      const value = read(endpoint, repo),
        text = JSON.stringify(value);
      if (
        !value ||
        typeof value !== 'object' ||
        !text ||
        Buffer.byteLength(text) > 4 * 1024 * 1024 ||
        !isDeepStrictEqual(value, JSON.parse(text))
      )
        fail();
      return text;
    } catch {
      return fail();
    }
  };
  const observation = {
    read(endpoint, target) {
      if (
        closed ||
        failure ||
        target !== repo ||
        typeof endpoint !== 'string' ||
        endpoint.length > 2048
      )
        fail();
      if (!records.has(endpoint)) {
        if (records.size >= 128) fail();
        const text = capture(endpoint);
        total += Buffer.byteLength(text);
        if (total > 16 * 1024 * 1024) fail();
        records.set(endpoint, text);
      }
      return JSON.parse(records.get(endpoint));
    },
  };
  return remoteObservation.run(observation, () => {
    try {
      const result = collect();
      if (failure || result?.then) fail();
      for (const [endpoint, text] of records) {
        if (!isDeepStrictEqual(JSON.parse(text), JSON.parse(capture(endpoint)))) fail();
      }
      return result;
    } finally {
      closed = true;
    }
  });
}
