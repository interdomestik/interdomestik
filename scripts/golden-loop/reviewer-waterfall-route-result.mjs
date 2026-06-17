export function routeModel(route) {
  const args = route?.args || [];
  const modelIndex = args.indexOf('--model');
  return modelIndex >= 0 ? args[modelIndex + 1] : route?.model || route?.command || 'unknown';
}

export function routeProvider(route) {
  if (route?.provider) return route.provider;
  if (route?.command === 'claude') return 'anthropic';
  if (route?.command === 'gemini') return 'google';
  return route?.command || 'unknown';
}

export function routeCommand(route) {
  return route ? [route.command, ...(route.args || [])] : [];
}

export function statusForReview(reviewStatus) {
  if (reviewStatus === 'completed') return 'ran';
  if (['blocked', 'unavailable'].includes(reviewStatus)) return 'blocked';
  return 'failed';
}

export function missingRouteResult(reviewer) {
  return {
    reviewer,
    routeName: reviewer,
    status: 'blocked',
    reviewStatus: 'unavailable',
    blockerReason: 'no_route_defined',
    reason: 'no route defined',
    commandInvoked: [],
    exitCode: null,
  };
}

export function reviewedRouteResult({ reviewer, route, execResult, classified, reviewPacket, options }) {
  return {
    reviewer,
    routeName: reviewer,
    provider: routeProvider(route),
    model: routeModel(route),
    commandInvoked: execResult.commandInvoked || routeCommand(route),
    status: statusForReview(classified.status),
    reviewStatus: classified.status,
    reason: classified.reason,
    blockerReason: execResult.blockerReason || (classified.status === 'blocked' ? classified.reason : ''),
    exitCode: execResult.exitCode ?? null,
    firstOutputTimeout: execResult.firstOutputTimeout || {
      timedOut: false,
      timeoutMs: options.noOutputTimeoutMs || null,
    },
    totalTimeout: execResult.totalTimeout || { timedOut: false, timeoutMs: options.timeoutMs || null },
    ...(reviewPacket ? { reviewPacket } : {}),
  };
}

export function skippedRouteResult({ reviewer, route, winner, options }) {
  return {
    reviewer,
    routeName: reviewer,
    provider: routeProvider(route),
    model: routeModel(route),
    commandInvoked: routeCommand(route),
    status: 'skipped',
    reviewStatus: 'skipped',
    reason: `fallback not needed; winner ${winner}`,
    blockerReason: '',
    exitCode: null,
    firstOutputTimeout: { timedOut: false, timeoutMs: options.noOutputTimeoutMs || null },
    totalTimeout: { timedOut: false, timeoutMs: options.timeoutMs || null },
  };
}
