import { ReadSeamError } from './information-request-read-projection.fixture';

export async function waitForReadSignal(signal: Promise<void>, deadline: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>(resolve => {
    timer = setTimeout(() => resolve(false), Math.max(0, deadline - performance.now()));
  });
  try {
    return await Promise.race([signal.then(() => true), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export function createGate() {
  let opened = false;
  let resolveGate: () => void = () => undefined;
  const promise = new Promise<void>(resolve => {
    resolveGate = resolve;
  });
  return {
    promise,
    open: () => {
      opened = true;
      resolveGate();
    },
    isOpen: () => opened,
  };
}

export function createReadSignals(hold: boolean | undefined) {
  const gate = hold ? createGate() : null;
  const readyToRelease = createGate();
  const finished = createGate();
  return {
    gate,
    readyToRelease,
    finished,
    waitForRead(phase: 'held' | 'settled'): Promise<void> {
      if (phase === 'settled') return finished.promise;
      if (!gate) throw new ReadSeamError('S7 read-result seam read was armed without a hold');
      // If the read fails before the hold, let assertNoError report the stored error.
      return Promise.race([readyToRelease.promise, finished.promise]);
    },
  };
}
