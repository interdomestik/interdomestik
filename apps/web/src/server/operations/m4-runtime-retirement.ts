import type postgres from 'postgres';
// Settles only the two explicit owned pool arguments; memoization stays with the operation owner.
export function settleM4OwnedPools(
  identity: postgres.Sql | undefined,
  data: postgres.Sql | undefined
) {
  return Promise.allSettled(
    [identity, data]
      .filter((pool): pool is postgres.Sql => Boolean(pool))
      .map(pool => Promise.resolve().then(() => pool.end({ timeout: 0 })))
  ).then(results => results.every(result => result.status === 'fulfilled'));
}

export function stopM4OwnedOperations(
  pending: ReadonlyArray<{ stop(): void; done: Promise<void> }>,
  notificationOwner: { close(): Promise<void> } | undefined
) {
  for (const operation of pending) operation.stop();
  return Promise.all([...pending.map(operation => operation.done), notificationOwner?.close()]);
}
