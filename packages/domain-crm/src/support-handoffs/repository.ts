import type { CrmActorContext } from '../context';
import type { SupportHandoff, SupportHandoffCrmState } from './types';

export type SupportHandoffRepositoryLookup = {
  actor: CrmActorContext;
  handoffId: string;
};

export type SupportHandoffRepositorySave = {
  actor: CrmActorContext;
  expectedLifecycleVersion: number;
  handoff: SupportHandoff;
  previousState: SupportHandoffCrmState;
  nextState: SupportHandoffCrmState;
};

export interface SupportHandoffRepository {
  findById(params: SupportHandoffRepositoryLookup): Promise<SupportHandoff | null>;
  save(params: SupportHandoffRepositorySave): Promise<SupportHandoff>;
}
