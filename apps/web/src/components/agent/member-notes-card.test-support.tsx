import { vi } from 'vitest';

// Shared doubles for the member-notes card tests. Each test file imports this module before
// the card, so the mocks below are registered first and a test and its mocks share one instance.

vi.mock('@/actions/member-notes', () => actions);
vi.mock('sonner', () => ({ toast }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('@interdomestik/ui', () => uiMock);
vi.mock('./member-note-item', () => noteItemMock);
vi.mock('./member-note-dialog', () => noteDialogMock);

export const actions = {
  getMemberNotes: vi.fn(),
  createMemberNote: vi.fn(),
  updateMemberNote: vi.fn(),
  deleteMemberNote: vi.fn(),
  toggleNotePin: vi.fn(),
};

export const toast = { success: vi.fn(), error: vi.fn() };

export const uiMock = {
  Button: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
};

export const noteItemMock = {
  MemberNoteItem: ({
    note,
    onEdit,
    onDelete,
    onTogglePin,
  }: {
    note: { id: string; content: string; isPinned: boolean };
    onEdit: (note: unknown) => void;
    onDelete: (id: string) => void;
    onTogglePin: (id: string) => void;
  }) => (
    <div data-testid={`note-${note.id}`} data-pinned={String(note.isPinned)}>
      {note.content}
      <button type="button" onClick={() => onEdit(note)}>
        edit {note.id}
      </button>
      <button type="button" onClick={() => onDelete(note.id)}>
        delete {note.id}
      </button>
      <button type="button" onClick={() => onTogglePin(note.id)}>
        pin {note.id}
      </button>
    </div>
  ),
};

export const noteDialogMock = {
  MemberNoteDialog: ({
    open,
    noteContent,
    onContentChange,
    onSubmit,
  }: {
    open: boolean;
    noteContent: string;
    onContentChange: (value: string) => void;
    onSubmit: () => void;
  }) =>
    open ? (
      <div data-testid="editor">
        <textarea
          aria-label="content"
          value={noteContent}
          onChange={event => onContentChange(event.target.value)}
        />
        <button type="button" onClick={onSubmit}>
          submit
        </button>
      </div>
    ) : null,
};

export const note = (id: string, memberId: string, extra: Record<string, unknown> = {}) => ({
  id,
  memberId,
  authorId: 'agent-a',
  authorName: 'Agent A',
  type: 'general',
  content: `content ${id}`,
  isPinned: false,
  isInternal: true,
  followUpDate: null,
  createdAt: new Date('2026-11-23T08:00:00Z'),
  updatedAt: null,
  ...extra,
});

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
});
