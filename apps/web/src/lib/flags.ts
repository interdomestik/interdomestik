export const FLAGS = {
  AI_ASSISTANT: 'ai_assistant',
  NPS_SURVEY: 'nps_survey',
  NEW_PRICING: 'new_pricing',
  // Legacy flags
  FLIGHT_DELAY: 'flight_delay',
  CALL_ME_NOW: 'call_me_now',
  RESPONSE_SLA: 'response_sla',
} as const;

export const flags = {
  ...FLAGS,
  // Helper aliases for legacy code using flags.camelCase
  flightDelay: process.env.NEXT_PUBLIC_ENABLE_FLIGHT_DELAY === 'true',
  callMeNow: process.env.NEXT_PUBLIC_ENABLE_CALL_ME_NOW === 'true',
  responseSla: process.env.NEXT_PUBLIC_ENABLE_RESPONSE_SLA === 'true',
};

export type FeatureFlag = (typeof FLAGS)[keyof typeof FLAGS];

export const getFeatureFlag = (flag: FeatureFlag): boolean => {
  // Check environment variables first (NEXT_PUBLIC_FF_FLAG_NAME)
  const envName = `NEXT_PUBLIC_FF_${flag.toUpperCase()}`;
  if (process.env[envName] === 'true') {
    return true;
  }

  // Default fallbacks can be defined here
  const defaults: Partial<Record<FeatureFlag, boolean>> = {
    [FLAGS.AI_ASSISTANT]: false,
    [FLAGS.NPS_SURVEY]: false,
    [FLAGS.NEW_PRICING]: false,
  };

  return defaults[flag] ?? false;
};
