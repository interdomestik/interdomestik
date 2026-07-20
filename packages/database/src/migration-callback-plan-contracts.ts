import type { MigrationCorpusState } from './migration-corpus-contracts';

export type MigrationCallbackPlanErrorCode =
  | 'MIGRATION_CALLBACK_CORPUS_CAPABILITY_REJECTED'
  | 'MIGRATION_CALLBACK_DEPENDENCY_SOURCE_REJECTED'
  | 'MIGRATION_CALLBACK_READER_REJECTED'
  | 'MIGRATION_CALLBACK_CORPUS_CHANGED_DURING_READ'
  | 'MIGRATION_CALLBACK_PLAN_REJECTED'
  | 'MIGRATION_CALLBACK_CLEANUP_FAILED';

export type CallbackSourceStat = Readonly<{
  dev: bigint;
  ino: bigint;
  nlink: bigint;
  size: bigint;
  mtimeNs: bigint;
  ctimeNs: bigint;
  isFile: boolean;
}>;

export interface CallbackSourceHandle {
  stat(): Promise<CallbackSourceStat>;
  read(target: Uint8Array, offset: number, length: number, position: number): Promise<number>;
  close(): Promise<void>;
}

export interface CallbackSourceOps {
  readonly noFollowFlag: number;
  resolve(specifier: string): string | Promise<string>;
  realpath(path: string): Promise<string>;
  lstat(path: string): Promise<CallbackSourceStat>;
  open(path: string): Promise<CallbackSourceHandle>;
  importModule(url: string): Promise<unknown>;
}

export type MigrationReader = (config: Readonly<{ migrationsFolder: string }>) => unknown;
export type CallbackSourceBinding = Readonly<{
  packageRoot: string;
  hashes: readonly string[];
  urls: readonly string[];
  reader: MigrationReader | null;
}>;

export type OwnedMigration = Readonly<{
  bps: true;
  folderMillis: number;
  hash: string;
  sql: readonly string[];
}>;

export type OwnedCallbackPlan = Readonly<{
  migrations: readonly OwnedMigration[];
  entryOffsets: readonly number[];
  callbackItems: readonly string[];
  callbackPlanSha256: string;
}>;

export type MigrationCallbackPlanState = Readonly<{
  preCorpus: MigrationCorpusState;
  postCorpus: MigrationCorpusState;
  migrations: readonly OwnedMigration[];
  entryOffsets: readonly number[];
  callbackItems: readonly string[];
  callbackPlanSha256: string;
  dependencyHashes: readonly string[];
}>;

export class CallbackPlanFault extends Error {
  constructor(readonly code: MigrationCallbackPlanErrorCode) {
    super(code);
    this.name = 'CallbackPlanFault';
  }
}
