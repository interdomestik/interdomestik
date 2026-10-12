import { ownerOf } from './db-access-source.mjs';

// Tokens are meaningful only to this resolver instance/model. No caller can construct a frame
// by supplying parameter names or copied maps. Maps returned as evidence are detached copies.
export function createInvocationContexts(model, createFrame) {
  const tokens = new WeakMap();
  const frames = new WeakMap();
  const files = new Set(model.parsed.values());
  function tokenFor(frame) {
    if (!frame) return undefined;
    let token = tokens.get(frame);
    if (!token) {
      token = Object.freeze({});
      tokens.set(frame, token);
      frames.set(token, frame);
    }
    return token;
  }
  function lookup(token, use) {
    const frame = token && frames.get(token);
    return frame && use && files.has(use.getSourceFile()) && ownerOf(use) === frame.owner
      ? frame
      : undefined;
  }
  function bindingsFor(token) {
    const frame = token && frames.get(token);
    if (!frame) return undefined;
    const result = [];
    for (let scope = frame; scope; scope = scope.parent)
      for (const [parameter, argument] of scope.bindings ?? [])
        result.push(
          Object.freeze({ parameter, argument, callerContext: tokenFor(scope.callerEnv) })
        );
    return Object.freeze(result);
  }
  function register(fn, call, callerEnv, bindings, callerRunning) {
    const frame = createFrame(fn.node, fn.env, { bindings, callerEnv, callerRunning });
    const closureBindings = new Map();
    for (let scope = fn.env; scope; scope = scope.parent)
      for (const [parameter, argument] of scope.bindings ?? [])
        if (!closureBindings.has(parameter)) closureBindings.set(parameter, argument);
    return {
      frame,
      descriptor: Object.freeze({
        functionNode: fn.node,
        callNode: call,
        argumentBindings: new Map(bindings),
        closureBindings,
        context: tokenFor(frame),
        callerContext: tokenFor(callerEnv),
        definingContext: tokenFor(fn.env),
      }),
    };
  }
  return { register, lookup, bindingsFor };
}
