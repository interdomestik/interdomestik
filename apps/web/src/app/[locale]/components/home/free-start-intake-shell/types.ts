import type {
  FreeStartCategoryId as CategoryId,
  FreeStartIssueId as IssueId,
  FreeStartOutcomeId as OutcomeId,
} from '@/lib/free-start-contract';
import type { getSupportContacts } from '@/lib/support-contacts';

export type FreeStartIntakeShellProps = Readonly<{
  continueHref: string;
  initialCategory?: CategoryId;
  locale: string;
  neutralOtpHost?: string | null;
  neutralOtpTenantId?: string | null;
  tenantId?: string | null;
}>;

export type StepId = 'category' | 'details' | 'preview' | 'complete';
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ContinueRouteKey = 'membership' | 'member' | 'portal';
export type EvidenceItemId = 'first' | 'second' | 'third';

export type DraftState = {
  issueType: IssueId | '';
  incidentDate: string;
  counterparty: string;
  desiredOutcome: OutcomeId | '';
  summary: string;
};

export type SavedDraft = DraftState & {
  category: 'vehicle' | 'property';
  clientRequestId: string;
  createdAt: string;
  id: string;
  resumeStep: 'category' | 'details' | 'preview';
  updatedAt: string;
  version: number;
};

export type DraftSaveState =
  | 'idle'
  | 'saving'
  | 'saved'
  | 'dirty'
  | 'loading'
  | 'conflict'
  | 'limit'
  | 'invalid'
  | 'unsupported'
  | 'accountContext'
  | 'error'
  | 'deleted';

// prettier-ignore
type SecureSaveManageCopy = Record<'delete' | 'emptyBody' | 'emptyHeading' | 'heading' | 'inProgress' | 'loadMore' | 'loading' | 'open' | 'ready' | 'resume', string>;
// prettier-ignore
type SecureSaveOtpCopy = Record<'body' | 'changeEmail' | 'codeLabel' | 'emailLabel' | 'heading' | 'send' | 'sending' | 'sent' | 'verify' | 'verifying', string> & { errors: Record<string, string> };

export type SecureSaveCopy = {
  body: string;
  delete: { body: string; cancel: string; confirm: string; heading: string };
  eyebrow: string;
  heading: string;
  manage: SecureSaveManageCopy;
  otp: SecureSaveOtpCopy;
  privacy: string;
  save: string;
  saveChanges: string;
  startAnother: string;
  status: Partial<Record<DraftSaveState, string>>;
};

export function parseSecureSaveCopy(value: unknown): SecureSaveCopy {
  return JSON.parse(String(value)) as SecureSaveCopy;
}

export type SecureSaveReviewCopy = Record<'accountContext' | 'invalid' | 'unsupported', string> & {
  handoff?: unknown;
};

export function parseSecureSaveReviewCopy(value: unknown): SecureSaveReviewCopy {
  return JSON.parse(String(value)) as SecureSaveReviewCopy;
}

export type DraftField = keyof DraftState;
export type FreeStartCopy = (key: string) => string;
export type SupportContacts = ReturnType<typeof getSupportContacts>;
export type SetDraftField = <K extends DraftField>(field: K, value: DraftState[K]) => void;

// prettier-ignore
export const draftFingerprint = (category: CategoryId | null, draft: DraftState, step: StepId) => JSON.stringify([category, draft.counterparty, draft.desiredOutcome, draft.incidentDate, draft.issueType, step === 'complete' ? 'preview' : step, draft.summary]);

export function createUuidV4(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64;
  bytes[8] = (bytes[8]! & 63) | 128;
  const value = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

export function draftFailureState(code: string): DraftSaveState {
  if (code === 'invalid') return 'invalid';
  if (code === 'unavailableAccountContext') return 'accountContext';
  if (code === 'limitReached') return 'limit';
  return 'error';
}

export function draftFingerprintState(
  hasActive: boolean,
  saved: string | null,
  current: string
): DraftSaveState {
  if (!hasActive || !saved) return 'idle';
  return saved === current ? 'saved' : 'dirty';
}

export function resolveEditedDraftState(
  state: DraftSaveState,
  eligible: boolean,
  fingerprintState: DraftSaveState
): DraftSaveState {
  if (state === 'invalid' || (state === 'unsupported' && eligible)) return fingerprintState;
  if (fingerprintState === 'idle' || !['saved', 'dirty', 'deleted'].includes(state)) return state;
  return fingerprintState;
}

export async function runDraftTask<T>(
  lock: { current: boolean },
  task: () => Promise<T>,
  rejected?: () => T
): Promise<T | undefined> {
  if (lock.current) return undefined;
  lock.current = true;
  try {
    return await task();
  } catch (error) {
    if (error instanceof Error && error.message === 'secure_save_intent_failed') throw error;
    return rejected?.();
  } finally {
    lock.current = false;
  }
}

export function withoutDraft(items: SavedDraft[], id: string): SavedDraft[] {
  return items.filter(item => item.id !== id);
}

export type { CategoryId, IssueId, OutcomeId };
