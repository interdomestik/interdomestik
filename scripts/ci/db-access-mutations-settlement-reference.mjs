// Frozen reviewed v6 finish; base HEAD 9d281793cd3f81d487db0d1e73134b5c50de95e1.
// sha256 11fd45d27b1c76bb924bdac58bfeedaf864a81a67414a2605199e8778941eeb7. @KEY@ stands for its
// generation-key template literal so this frozen text needs no escapes.
const GENERATION_KEY = '`${mutations.size}:${unsafeMutations.size}`';
export const ORIGINAL_FINISH = `  function finish(provenance) {
    let previous;
    for (let round = 0; round < 32; round++) {
      provenance.dispatch?.reset();
      const state = provenance.dispatch?.state();
      for (const reason of state?.reasons ?? []) analysisUnknown.add(reason);
      const beforeMutations = @KEY@;
      const signature = JSON.stringify([
        mutations.size,
        unsafeMutations.size,
        state?.escaped.size,
        [...(state?.callers ?? [])].map(([fn, list]) => [model.fileOf(fn), fn.pos, list.length]),
        [...analysisUnknown].sort(),
      ]);
      if (signature === previous) return;
      previous = signature;
      for (const node of opaqueCalls) {
        const external = externalOrigin(node.expression);
        const declarative =
          (!changed(node) && externalValue(model, node.expression, { isMutated })) ||
          (external &&
            !changed(node) &&
            ['drizzle-orm', 'drizzle-orm/pg-core'].includes(external.module) &&
            [
              'pgEnum',
              'pgTable',
              'relations',
              'index',
              'uniqueIndex',
              'check',
              'foreignKey',
              'primaryKey',
              'unique',
              'eq',
              'and',
              'or',
              'asc',
              'desc',
              'ilike',
              'inArray',
              'isNull',
              'sql',
            ].includes(external.name));
        if (
          !declarative &&
          !(model.isQueryOperator(node.expression) && !isMutated(node.expression)) &&
          !canonicalQueryChain(node.expression, provenance) &&
          !dispatchCoverage(provenance, node).covered
        )
          for (const argument of node.arguments) {
            // Actual closure/parameter origins share the invocation registry used by dispatch.
            for (const variant of state?.byCall.get(node) ?? []) {
              const origins = state.effects.origins(argument, variant.context);
              for (const item of origins.values) {
                const declaration = model.declaration(item.node);
                if (
                  (!declaration || !isFunction(declaration)) &&
                  (changed(node) ||
                    !declaration ||
                    model.fileOf(declaration) === model.fileOf(node))
                )
                  invalidate(item.node, changed(node));
              }
            }
            const target = model.declaration(unwrap(argument));
            if (target && isFunction(target)) continue; // Passing a function escapes its invocation provenance, not its binding.
            if (changed(node) || !target || model.fileOf(target) === model.fileOf(node))
              invalidate(argument, changed(node));
          }
      }
      for (const sf of model.parsed.values())
        model.walk(sf, node => {
          if (ts.isVariableDeclaration(node) && node.initializer && isMutated(node.name))
            invalidate(node.initializer, unsafeMutations.has(model.symbol(node.name)));
          if (ts.isParameter(node) && isFunction(node.parent)) {
            let mutated = false,
              strict = false;
            model.walk(node.name, part => {
              if (isMutated(part)) mutated = true;
              if (unsafeMutations.has(model.symbol(part))) strict = true;
            });
            if (mutated) {
              // Preserve syntax callers AND every resolved method/factory/closure caller.
              for (const call of calls.get(node.parent) ?? [])
                invalidate(
                  call.arguments[node.parent.parameters.indexOf(node)],
                  strict || changed(call)
                );
              for (const call of state?.callers.get(node.parent) ?? []) {
                const argument = call.argumentBindings.get(node);
                const origins = state.effects.origins(argument, call.callerContext);
                for (const item of origins.values)
                  invalidate(item.node, strict || changed(call.callNode));
                invalidate(argument, strict || changed(call.callNode));
              }
            }
          }
        });
      if (beforeMutations === @KEY@) return;
    }
    analysisUnknown.add('mutation-dispatch-settlement-bound');
  }`.replaceAll('@KEY@', () => GENERATION_KEY);
