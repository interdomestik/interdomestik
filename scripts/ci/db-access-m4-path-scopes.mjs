import { m4ObservationKey } from './db-access-m4-context-attribution.mjs';
import { pathFail } from './db-access-m4-path-storage.mjs';

// Scope tokens are private local restoration tokens, never transport evidence.
export function createM4PathScopes(isSelectedOwner, metadata, storage, flush) {
  let active;
  const keys = new WeakMap();
  const observationKey = row => {
    if (!keys.has(row)) keys.set(row, m4ObservationKey(row));
    return keys.get(row);
  };
  function assertToken(token) {
    if (!active || active.token !== token) pathFail('non-LIFO owner restoration');
  }
  return {
    enter(owner, origin, invocation, context, definingContext) {
      if (!active && !isSelectedOwner(owner)) return null;
      flush();
      const token = Object.freeze({});
      active = {
        token,
        parent: active,
        owner,
        origin,
        invocation,
        context,
        definingContext,
        selectedKeys: active?.selectedKeys ?? [],
        selectionId: active?.selectionId,
        ownObserved: false,
        evaluation: undefined,
        scopeId: undefined,
      };
      return token;
    },
    activate(observed) {
      if (!active || active.ownObserved || !isSelectedOwner(active.owner))
        pathFail('selected observation outside its actual owner scope');
      const values = [...observed.values()];
      if (!values.length || values.some(row => row.origin !== active.origin))
        pathFail('selected observation origin');
      active.selectedKeys = [
        ...new Set([...active.selectedKeys, ...values.map(observationKey)]),
      ].sort();
      active.selectionId = storage.selection(active.selectedKeys);
      active.ownObserved = true;
      active.scopeId = undefined;
    },
    leave(token) {
      if (token === null) {
        if (active) pathFail('active owner under null restoration');
        return;
      }
      assertToken(token);
      const previous = active.parent;
      try {
        if (active.evaluation) pathFail('unrestored evaluation scope');
        flush();
      } finally {
        active = previous;
      }
    },
    enterEvaluation(context, site) {
      if (!active?.selectedKeys.length) return null;
      flush();
      const token = Object.freeze({});
      active.evaluation = { token, previous: active.evaluation, context, site, scopeId: undefined };
      return token;
    },
    leaveEvaluation(token) {
      if (token === null) return;
      if (!active || active.evaluation?.token !== token)
        pathFail('non-LIFO evaluation restoration');
      const previous = active.evaluation.previous;
      try {
        flush();
      } finally {
        active.evaluation = previous;
      }
    },
    selected: () => Boolean(active?.selectedKeys.length),
    active: () => Boolean(active),
    scope() {
      if (!active?.selectedKeys.length) pathFail('no selected scope');
      const slot = active.evaluation ?? active;
      if (slot.scopeId) return slot.scopeId;
      slot.scopeId = storage.scope({
        selectionId: active.selectionId,
        origin: active.origin,
        emitterOwner: metadata.location(active.owner),
        invocation: metadata.location(active.invocation),
        traversalContext: metadata.frame(active.context),
        definingContext: metadata.frame(active.definingContext),
        evaluationContext: metadata.frame(
          active.evaluation ? active.evaluation.context : active.context
        ),
        evaluationSite: metadata.location(active.evaluation?.site),
        evaluationContextStatus: active.evaluation
          ? 'explicit-channel-context'
          : 'traversal-context-only',
      });
      return slot.scopeId;
    },
    clear() {
      active = undefined;
    },
  };
}
