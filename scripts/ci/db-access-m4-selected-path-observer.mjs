import { createM4PathStorage, pathCount, pathFail } from './db-access-m4-path-storage.mjs';
import { createM4PathMetadata } from './db-access-m4-path-metadata.mjs';
import { createM4PathScopes } from './db-access-m4-path-scopes.mjs';

// Only the source-authenticated census constructs this with fixed internal readers.
// This is observation machinery, not a native/runtime proof or handle constructor.
export function createM4SelectedPathObserver({ isSelectedOwner, locate, peekBindings }) {
  let storage, metadata, scopes, pending, installed, everInstalled, failed, finished;
  let initialRaw, finalRaw, wrappedOccurrences, pushCalls;
  function flush() {
    if (!pending) return;
    const value = pending;
    pending = undefined;
    try {
      storage.append(value);
    } catch (error) {
      failed = true;
      throw error;
    }
  }
  function ready() {
    if (!storage || failed || finished) pathFail('inactive/failed/finished observer');
  }
  function total(collector) {
    const value = collector.rawCount;
    pathCount(0, value);
    return value;
  }
  return Object.freeze({
    begin() {
      if (installed || scopes?.active()) pathFail('unfinished prior batch');
      storage = createM4PathStorage();
      metadata = createM4PathMetadata(locate, peekBindings, storage.budget);
      scopes = createM4PathScopes(isSelectedOwner, metadata, storage, flush);
      pending = undefined;
      everInstalled = failed = finished = false;
      wrappedOccurrences = pushCalls = 0;
      initialRaw = finalRaw = undefined;
    },
    installDiagnostics(collector) {
      ready();
      if (installed || everInstalled || !Array.isArray(collector.entries))
        pathFail('collector installation');
      const descriptor = Object.getOwnPropertyDescriptor(collector, 'push');
      if (!descriptor || typeof descriptor.value !== 'function' || !descriptor.writable)
        pathFail('collector push descriptor');
      const original = descriptor.value,
        entries = collector.entries;
      initialRaw = finalRaw = total(collector);
      function wrappedPush(...items) {
        ready();
        if (collector.entries !== entries) pathFail('foreign collector entries');
        flush();
        const before = total(collector);
        let result;
        try {
          result = Reflect.apply(original, this, items);
        } catch (error) {
          failed = true;
          throw error;
        }
        try {
          const after = total(collector);
          if (after < before) pathFail('collector count decreased');
          finalRaw = after;
          wrappedOccurrences = pathCount(wrappedOccurrences, after - before);
          pushCalls = pathCount(pushCalls, 1);
          if (!scopes.selected()) return result;
          let emitted = 0;
          for (const item of items) {
            flush();
            const occurrences = item.occurrences ?? 1;
            if (!Number.isSafeInteger(occurrences) || occurrences < 1)
              pathFail('invalid original multiplicity');
            emitted = pathCount(emitted, occurrences);
            pending = {
              scopeId: scopes.scope(),
              diagnosticKey: JSON.stringify([item.file, item.reason]),
              legacyDiagnosticKey: null,
              occurrences,
              pushSize: items.length,
            };
          }
          if (emitted !== after - before) pathFail('collector/original emission count mismatch');
          return result;
        } catch (error) {
          failed = true;
          throw error;
        }
      }
      Object.defineProperty(collector, 'push', { ...descriptor, value: wrappedPush });
      installed = { collector, original, wrappedPush, descriptor, entries };
      everInstalled = true;
      let detached = false;
      return () => {
        if (detached) return;
        detached = true;
        const state = installed;
        try {
          if (!state || state.collector !== collector || collector.push !== wrappedPush)
            pathFail('collector replacement before detach');
          if (scopes.active()) pathFail('unrestored owner at detach');
          flush();
          finalRaw = total(collector);
        } catch (error) {
          failed = true;
          throw error;
        } finally {
          Object.defineProperty(collector, 'push', descriptor);
          installed = undefined;
          scopes.clear();
        }
      };
    },
    enter(owner, origin, invocation, context, definingContext) {
      ready();
      try {
        return scopes.enter(owner, origin, invocation, context, definingContext);
      } catch (error) {
        failed = true;
        throw error;
      }
    },
    leave(token) {
      try {
        return scopes.leave(token);
      } catch (error) {
        failed = true;
        throw error;
      }
    },
    activate(observed) {
      ready();
      try {
        return scopes.activate(observed);
      } catch (error) {
        failed = true;
        throw error;
      }
    },
    enterEvaluation(context, site) {
      ready();
      try {
        return scopes.enterEvaluation(context, site);
      } catch (error) {
        failed = true;
        throw error;
      }
    },
    leaveEvaluation(token) {
      try {
        return scopes.leaveEvaluation(token);
      } catch (error) {
        failed = true;
        throw error;
      }
    },
    legacy(key, origin, reason) {
      ready();
      if (
        !pending ||
        pending.pushSize !== 1 ||
        pending.legacyDiagnosticKey !== null ||
        pending.diagnosticKey !== JSON.stringify([origin, reason]) ||
        !/^[a-f0-9]{64}$/u.test(key)
      ) {
        failed = true;
        pathFail('missing/ambiguous legacy diagnostic overlap');
      }
      pending.legacyDiagnosticKey = key;
    },
    finish() {
      ready();
      if (!everInstalled || installed || scopes.active())
        pathFail('missing installation/detach/unrestored owner');
      flush();
      if (finalRaw - initialRaw !== wrappedOccurrences)
        pathFail('unobserved original collector writes');
      const values = storage.output();
      if (values.selectedOccurrences > wrappedOccurrences) pathFail('path emission overclaim');
      finished = true;
      return {
        version: 1,
        selections: values.selections,
        frames: metadata.output(),
        scopes: values.scopes,
        records: values.records,
        counters: {
          collectorInitialRawCount: initialRaw,
          collectorFinalRawCount: finalRaw,
          wrappedOccurrences,
          selectedPathOccurrences: values.selectedOccurrences,
          legacyOverlapOccurrences: values.overlapOccurrences,
          additionalPathOccurrences: values.selectedOccurrences - values.overlapOccurrences,
          offPathOccurrences: wrappedOccurrences - values.selectedOccurrences,
          pushCalls,
          storage: values.storage,
        },
        outsideScopeApplicability: 'unresolved',
        runtimeAdmission: false,
        allExecutableContextsQualified: false,
      };
    },
  });
}
