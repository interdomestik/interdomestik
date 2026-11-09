export function sendPwaWorkerMessage(
  worker: ServiceWorker,
  type: 'CACHE_HELP_NOW_PACK'
): Promise<boolean> {
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = (ok: boolean): void => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(ok);
    };
    const timeout = setTimeout(() => finish(false), 15000);
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      const data = event.data;
      finish(typeof data === 'object' && data !== null && 'ok' in data && data.ok === true);
    };
    try {
      worker.postMessage({ type }, [channel.port2]);
    } catch {
      finish(false);
    }
  });
}
