export * from './types';
export * from './recovery-law';
export * from './law-pack-schema';
export * from './law-pack-registry';
export * from './law-pack-resolution';
export * from './success-fee-collection';
export { buildRecoverySuccessFeeCollectedPayload } from './success-fee-collection-event-payload';
export * from './success-fee-collection-resolution';

type RecordRecoverySuccessFeeCollectedEventParams = Parameters<
  typeof import('./success-fee-collection-event').recordRecoverySuccessFeeCollectedEvent
>[0];

export async function recordRecoverySuccessFeeCollectedEvent(
  params: RecordRecoverySuccessFeeCollectedEventParams
) {
  const { recordRecoverySuccessFeeCollectedEvent: recordEvent } =
    await import('./success-fee-collection-event');

  await recordEvent(params);
}
