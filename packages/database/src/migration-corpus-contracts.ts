export type MigrationCorpusErrorCode =
  | 'MIGRATION_CORPUS_PLATFORM_UNSUPPORTED'
  | 'MIGRATION_CORPUS_ROOT_REJECTED'
  | 'MIGRATION_CORPUS_JOURNAL_REJECTED'
  | 'MIGRATION_CORPUS_TOPOLOGY_REJECTED'
  | 'MIGRATION_CORPUS_FILE_REJECTED'
  | 'MIGRATION_CORPUS_CHANGED_DURING_READ'
  | 'MIGRATION_CORPUS_CLEANUP_FAILED';

export type CorpusEntryKind = 'file' | 'directory' | 'symlink' | 'other';

export type CorpusStat = Readonly<{
  dev: bigint;
  ino: bigint;
  nlink: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
  kind: CorpusEntryKind;
}>;

export type CorpusDirectoryEntry = Readonly<{ name: string; kind: CorpusEntryKind }>;

export interface CorpusHandle {
  fstatBigint(): Promise<CorpusStat>;
  close(): Promise<void>;
}

export interface CorpusFileHandle extends CorpusHandle {
  read(target: Uint8Array, offset: number, length: number, position: number): Promise<number>;
}

export interface CorpusDirectoryStream extends AsyncIterable<CorpusDirectoryEntry> {
  close(): Promise<void>;
}

export type CorpusStage =
  | 'before_lstat'
  | 'after_lstat'
  | 'after_open'
  | 'after_read'
  | 'before_postcheck'
  | 'before_close';

export interface CorpusFsOps {
  readonly noFollowFlag: number;
  readonly directoryFlag: number;
  lstatBigint(path: string): Promise<CorpusStat>;
  realpath(path: string): Promise<string>;
  openFile(path: string): Promise<CorpusFileHandle>;
  openDirectory(path: string): Promise<CorpusHandle>;
  streamDirectory(path: string): Promise<CorpusDirectoryStream>;
  onStage?(stage: CorpusStage, relativeName: string): Promise<void>;
}

export type MigrationCorpusState = Readonly<{
  realRoot: string;
  journalSha256: string;
  corpusSha256: string;
  journalNames: readonly string[];
  excludedNames: readonly string[];
  rootIdentity: CorpusStat;
}>;

export type InternalVerificationResult =
  | Readonly<{ ok: true; state: MigrationCorpusState }>
  | Readonly<{ ok: false; error: Readonly<{ code: MigrationCorpusErrorCode }> }>;

export class CorpusFault extends Error {
  constructor(readonly code: MigrationCorpusErrorCode) {
    super(code);
    this.name = 'CorpusFault';
  }
}
