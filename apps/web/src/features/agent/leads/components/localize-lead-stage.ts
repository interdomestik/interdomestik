import type { LeadDetailTranslator } from './AgentLeadDetailV2Page';

export function localizeLeadStage(stage: string | null | undefined, t: LeadDetailTranslator) {
  switch (stage) {
    case 'new':
      return t('stages.new');
    case 'contacted':
      return t('stages.contacted');
    case 'qualified':
      return t('stages.qualified');
    case 'proposal':
      return t('stages.proposal');
    case 'negotiation':
      return t('stages.negotiation');
    case 'won':
      return t('stages.won');
    case 'lost':
      return t('stages.lost');
    default:
      return t('stages.unknown');
  }
}
