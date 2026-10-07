import { act, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { type Mock, vi } from 'vitest';
import type { DraftAccount } from '../draft-lifecycle-editor';
import type { CategoryId, DraftState, StepId } from '../types';
import { useDraftLifecycle } from '../use-draft-lifecycle';
import { account, saved } from './terminal-draft-fixtures';

export type Props = Readonly<{
  account?: DraftAccount | null;
  category: CategoryId | null;
  draft: DraftState;
  step: StepId;
}>;
/** Suite-owned action mocks; shared defaults never create or retain a mock singleton. */
export type DraftActionMocks = Readonly<{
  account: Mock;
  create: Mock;
  update: Mock;
  list: Mock;
  resume: Mock;
  remove: Mock;
}>;
export const QUIET_MS = 250;
export const blank: DraftState = {
  issueType: '',
  incidentDate: '',
  counterparty: '',
  desiredOutcome: '',
  summary: '',
};
export const facts = (summary: string): DraftState => ({
  ...blank,
  issueType: 'collision',
  counterparty: 'Insurer',
  summary,
});
export const verified: Props = { account, category: 'vehicle', draft: blank, step: 'details' };

const MICROTASK_YIELDS = 25;
/** One sequential `.then` hop per microtask; Promise.all would collapse them into one drain. */
function chainMicrotasks(hops: number): Promise<void> {
  return Array.from({ length: hops }).reduce<Promise<void>>(
    chain => chain.then(() => undefined),
    Promise.resolve()
  );
}

/** Advances fake time and drains action/queue microtasks inside one act scope; no waitFor. */
export async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    // 24 chained hops plus this await are exactly 25 sequential microtask yields.
    await chainMicrotasks(MICROTASK_YIELDS - 1);
  });
}

/** Real hook and real queue; `strict` mounts under React StrictMode (setup→cleanup→setup). */
export function setup(initial: Props = verified, strict = false) {
  const onReset = vi.fn(),
    onResume = vi.fn();
  let props = initial;
  const hook = renderHook(
    (current: Props) => useDraftLifecycle({ ...current, onReset, onResume }),
    { initialProps: props, ...(strict ? { wrapper: StrictMode } : {}) }
  );
  const change = (next: Partial<Props>) => {
    props = { ...props, ...next };
    hook.rerender(props);
  };
  const type = (summary: string) => change({ draft: facts(summary) });
  return { hook, onReset, onResume, change, type };
}
export type Lifecycle = ReturnType<typeof setup>;

/** Applies the shared successful-action defaults to only the supplied suite-owned mocks. */
export function configureDefaultActions(actions: DraftActionMocks): void {
  const { expectedContext } = account;
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.list.mockResolvedValue({ ok: true, items: [], nextCursor: null, expectedContext });
  actions.create.mockResolvedValue({ ok: true, draft: saved });
  // Preserve immediate evaluation and rejection when the receipt getter throws.
  const nextVersion = (input: { expectedVersion: number }) => {
    try {
      return Promise.resolve({ ok: true, draft: { ...saved, version: input.expectedVersion + 1 } });
    } catch (error) {
      return Promise.reject(error);
    }
  };
  actions.update.mockImplementation(nextVersion);
  actions.resume.mockResolvedValue({ ok: true, draft: saved, expectedContext });
  actions.remove.mockResolvedValue({ ok: true });
}
