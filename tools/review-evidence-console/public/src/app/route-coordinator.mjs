export function createRouteCoordinator() {
  let generation = 0;
  return {
    begin: () => ++generation,
    isCurrent: token => token === generation,
    invalidate: () => ++generation,
  };
}
