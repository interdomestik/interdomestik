'use server';
// Thin wrapper to keep import path stable while implementation lives in `./agent-settings.core`.
export {
  getAgentSettings,
  updateAgentCommissionRates,
  updateAgentTier,
} from './agent-settings.core';
