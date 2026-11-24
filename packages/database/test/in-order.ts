export function runSequentially<T>(items: readonly T[], run: (item: T) => Promise<void>) {
  return items.reduce((previous, item) => previous.then(() => run(item)), Promise.resolve());
}
