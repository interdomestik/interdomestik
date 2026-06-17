type BoundedWorkItemPoolFulfilled<TItem, TValue> = {
  index: number;
  item: TItem;
  status: 'fulfilled';
  value: TValue;
};

type BoundedWorkItemPoolRejected<TItem> = {
  error: unknown;
  index: number;
  item: TItem;
  status: 'rejected';
};

export type BoundedWorkItemPoolOutcome<TItem, TValue> =
  | BoundedWorkItemPoolFulfilled<TItem, TValue>
  | BoundedWorkItemPoolRejected<TItem>;

export type BoundedWorkItemPoolResult<TItem, TValue> = {
  outcomes: BoundedWorkItemPoolOutcome<TItem, TValue>[];
  unscheduledCount: number;
};

export async function runBoundedWorkItemPool<TItem, TValue>(args: {
  concurrency: number;
  items: readonly TItem[];
  onStopScheduling?: () => void;
  run: (item: TItem, index: number) => Promise<TValue>;
  shouldStart: (item: TItem, index: number) => boolean;
  stopAfter?: (outcome: BoundedWorkItemPoolOutcome<TItem, TValue>) => boolean;
}): Promise<BoundedWorkItemPoolResult<TItem, TValue>> {
  const concurrency = Number.isFinite(args.concurrency) ? Math.floor(args.concurrency) : 1;
  const workerCount = Math.min(Math.max(1, concurrency), args.items.length);
  const outcomes: Array<BoundedWorkItemPoolOutcome<TItem, TValue> | undefined> = [];
  let nextIndex = 0;
  let scheduledCount = 0;
  let stopScheduling = false;

  async function worker(): Promise<void> {
    while (!stopScheduling) {
      const index = nextIndex;
      const item = args.items[index];
      if (item === undefined) return;
      if (!args.shouldStart(item, index)) {
        stopScheduling = true;
        args.onStopScheduling?.();
        return;
      }

      nextIndex += 1;
      scheduledCount += 1;

      let outcome: BoundedWorkItemPoolOutcome<TItem, TValue>;
      try {
        outcome = { index, item, status: 'fulfilled', value: await args.run(item, index) };
      } catch (error) {
        outcome = { error, index, item, status: 'rejected' };
      }
      outcomes[index] = outcome;

      if (args.stopAfter?.(outcome)) {
        stopScheduling = true;
        args.onStopScheduling?.();
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return {
    outcomes: outcomes.filter(
      (outcome): outcome is BoundedWorkItemPoolOutcome<TItem, TValue> => outcome !== undefined
    ),
    unscheduledCount: args.items.length - scheduledCount,
  };
}
