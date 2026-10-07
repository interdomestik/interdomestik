import { createFreeStartDraft, updateFreeStartDraft } from '@/actions/free-start-drafts';
import { freeStartDraftPayloadSchema } from '@/lib/validators/free-start-draft';
import {
  createAccountDraftWriteQueue,
  type AccountDraftWriteQueue,
  type DraftQueueContext,
  type DraftWriteSnapshot,
} from './account-draft-write-queue';
import {
  createUuidV4,
  draftFingerprint,
  resolveEditedDraftState,
  draftFingerprintState,
  type CategoryId,
  type DraftSaveState,
  type DraftState,
  type SavedDraft,
  type StepId,
} from './types';
export type DraftAccount = Readonly<{ emailVerified: boolean; expectedContext: DraftQueueContext }>;
export type DraftEditorArgs = Readonly<{
  account?: DraftAccount | null;
  category: CategoryId | null;
  draft: DraftState;
  step: StepId;
  onReset: () => void;
  onResume: (draft: SavedDraft) => void;
}>;
export type DraftEditorView = {
  active: SavedDraft | null;
  items: SavedDraft[];
  nextCursor: { id: string; updatedAt: string } | null;
  intent: 'save' | 'manage' | null;
  state: DraftSaveState;
  verified: boolean;
  readAdmitted: boolean;
  identityKey: number;
  managerBusy: boolean;
};
export type DraftEditorToken = { generation: number; owner: string; fingerprint: string };
export const accountKey = (account: DraftAccount | null | undefined) =>
  account
    ? JSON.stringify([account.expectedContext.ownerUserId, account.expectedContext.tenantId])
    : '';
export const hasDraftFacts = (draft: DraftState) =>
  Object.values(draft).some(value => value.trim() !== '');
export function receiptMatches(value: unknown, expected: DraftQueueContext): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const receipt = value as Record<string, unknown>;
  return (
    Object.keys(receipt).length === 2 &&
    receipt.ownerUserId === expected.ownerUserId &&
    receipt.tenantId === expected.tenantId
  );
}
export class DraftEditor {
  view: DraftEditorView = {
    active: null,
    items: [],
    nextCursor: null,
    intent: null,
    state: 'idle',
    verified: false,
    readAdmitted: false,
    identityKey: 0,
    managerBusy: false,
  };
  account: DraftAccount | null;
  generation = 0;
  initialized = false;
  explicitRequired: boolean;
  awaitingReset = false;
  terminal = false;
  disposed = false;
  savedFingerprint: string | null = null;
  queue: AccountDraftWriteQueue | null = null;
  queueToken: DraftEditorToken | null = null;
  admissionRevoked = false;
  retiredDraft: SavedDraft | null = null;
  private propIdentity: string;
  private writeStarted = false;
  private retiring = 0;
  constructor(
    readonly current: () => DraftEditorArgs,
    private readonly publish: (view: DraftEditorView) => void
  ) {
    this.account = current().account ?? null;
    this.explicitRequired = !this.account;
    this.propIdentity = this.propKey();
    this.view.verified = this.account?.emailVerified === true;
  }
  fingerprint() {
    const args = this.current();
    return draftFingerprint(args.category, args.draft, args.step);
  }
  propKey() {
    const account = this.current().account;
    return account === undefined
      ? 'unresolved'
      : JSON.stringify([accountKey(account), account?.emailVerified]);
  }
  patch(update: Partial<DraftEditorView>) {
    if (this.disposed) return;
    this.view = { ...this.view, ...update };
    this.publish(this.view);
  }
  token(): DraftEditorToken {
    return {
      generation: this.generation,
      owner: accountKey(this.account),
      fingerprint: this.fingerprint(),
    };
  }
  owns(token: DraftEditorToken, includeFingerprint = false) {
    return (
      !this.disposed &&
      token.generation === this.generation &&
      token.owner === accountKey(this.account) &&
      this.propKey() === this.propIdentity &&
      (!includeFingerprint || token.fingerprint === this.fingerprint())
    );
  }
  syncAccount(): boolean {
    const key = this.propKey();
    if (key === this.propIdentity) {
      if (this.awaitingReset && !hasDraftFacts(this.current().draft)) this.awaitingReset = false;
      return false;
    }
    this.propIdentity = key;
    if (this.current().account === undefined) return false;
    const next = this.current().account ?? null;
    const changedOwner = accountKey(next) !== accountKey(this.account);
    if (changedOwner) {
      const hadOwner = this.account !== null;
      this.queue?.dispose();
      this.queue = null;
      this.terminal = false;
      this.retiredDraft = null;
      this.generation++;
      this.savedFingerprint = null;
      this.writeStarted = false;
      this.initialized = false;
      this.explicitRequired = !hadOwner && hasDraftFacts(this.current().draft);
      this.awaitingReset = hadOwner && hasDraftFacts(this.current().draft);
      this.account = next;
      this.admissionRevoked = false;
      this.patch({
        active: null,
        items: [],
        nextCursor: null,
        intent: !hadOwner && this.view.intent === 'manage' ? 'manage' : null,
        state: 'idle',
        verified: next?.emailVerified === true,
        readAdmitted: false,
        identityKey: this.view.identityKey + 1,
        managerBusy: false,
      });
      if (hadOwner) this.current().onReset();
    } else {
      this.account = this.admissionRevoked && next ? { ...next, emailVerified: false } : next;
      this.patch({ verified: this.account?.emailVerified === true });
    }
    return true;
  }
  acceptAccount(next: DraftAccount): boolean {
    if (this.account && accountKey(this.account) !== accountKey(next)) return false;
    this.account = {
      emailVerified: next.emailVerified === true,
      expectedContext: { ...next.expectedContext },
    };
    this.patch({ verified: this.account.emailVerified });
    return true;
  }
  snapshot(): DraftWriteSnapshot | null {
    const args = this.current();
    if (!args.category || args.category === 'injury') return null;
    if (!hasDraftFacts(args.draft) && !this.view.active && !this.writeStarted) return null;
    const payload = {
      category: args.category,
      counterparty: args.draft.counterparty,
      desiredOutcome: args.draft.desiredOutcome || undefined,
      incidentDate: args.draft.incidentDate || undefined,
      issueType: args.draft.issueType || undefined,
      resumeStep: args.step === 'complete' ? ('preview' as const) : args.step,
      summary: args.draft.summary,
    };
    return freeStartDraftPayloadSchema.safeParse(payload).success
      ? { fingerprint: this.fingerprint(), payload }
      : null;
  }
  editedState(): DraftSaveState {
    if (this.current().category === 'injury') return 'unsupported';
    if (hasDraftFacts(this.current().draft) && !this.snapshot()) return 'invalid';
    if (!this.view.active) return 'idle';
    return this.savedFingerprint === this.fingerprint() ? 'saved' : 'dirty';
  }
  getQueue(rebind = false): AccountDraftWriteQueue | null {
    if (this.admissionRevoked) return null;
    if (!this.account?.emailVerified || this.terminal || this.awaitingReset) return null;
    if (this.queue && !(rebind && this.queue.getWriteFeedback() === 'conflict')) return this.queue;
    this.queue?.dispose();
    const token = (this.queueToken = this.token());
    this.queue = createAccountDraftWriteQueue({
      expectedContext: this.account.expectedContext,
      clientRequestId: createUuidV4(),
      create: input => {
        this.writeStarted = true;
        return createFreeStartDraft(input);
      },
      update: updateFreeStartDraft,
      onState: state => {
        if (!this.owns(token) || this.terminal) return;
        this.patch({ state: state === 'saved' ? this.editedState() : state });
      },
      onAck: (draft, fingerprint) => {
        if (!this.owns(token)) return;
        this.savedFingerprint = fingerprint;
        this.patch({ active: draft, verified: true });
      },
    });
    if (this.view.active) this.queue.adopt(this.view.active);
    return this.queue;
  }
  noteEdit() {
    const next = resolveEditedDraftState(
      this.view.state,
      Boolean(this.current().category && this.current().category !== 'injury'),
      draftFingerprintState(Boolean(this.view.active), this.savedFingerprint, this.fingerprint())
    );
    if (next !== this.view.state) this.patch({ state: next });
  }
  autoSave() {
    if (
      this.current().account === undefined ||
      !this.initialized ||
      this.explicitRequired ||
      this.awaitingReset ||
      this.terminal
    )
      return;
    const snapshot = this.snapshot();
    if (snapshot && !(this.view.active && this.savedFingerprint === snapshot.fingerprint))
      this.getQueue()?.enqueue(snapshot);
    else if (this.view.active) this.patch({ state: this.editedState() });
  }
  async retire(stillCurrent: () => boolean = () => true, recover = false): Promise<boolean> {
    this.terminal = true;
    const queue = this.queue;
    this.retiring++;
    const safe = queue ? await queue.retire(recover) : true;
    this.retiring--;
    if (!stillCurrent()) {
      if (this.admissionRevoked) return false;
      if (this.retiring > 0 || this.queue !== queue || this.disposed) return false;
      this.terminal = false;
      if (safe === true) {
        queue?.dispose();
        this.queue = null;
      } else this.patch({ state: safe ? 'conflict' : 'error' });
      this.autoSave();
      return false;
    }
    if (!safe) {
      this.terminal = false;
      this.patch({ state: 'error' });
      return false;
    }
    this.retiredDraft = queue?.getDraft() ?? this.view.active;
    if (safe !== true) return true; // a held divergent create replay stays frozen until rebind
    queue?.dispose();
    this.queue = null;
    return true;
  }
  reset(preserveFacts = false) {
    this.admissionRevoked = false;
    this.generation++;
    this.savedFingerprint = null;
    this.writeStarted = false;
    this.initialized = true;
    this.explicitRequired = preserveFacts;
    this.awaitingReset = !preserveFacts;
    this.terminal = false;
    this.patch({
      active: null,
      items: [],
      nextCursor: null,
      intent: null,
      state: 'idle',
      readAdmitted: false,
      identityKey: this.view.identityKey + 1,
      managerBusy: false,
    });
    if (!preserveFacts) this.current().onReset();
  }
  dispose(retain = false) {
    this.disposed = true;
    this.generation++;
    if (!retain) this.queue?.dispose();
  }
}
