type EventName =
  | 'claim_intake_viewed'
  | 'flight_delay_tile_viewed'
  | 'flight_delay_tile_clicked'
  | 'call_me_now_viewed'
  | 'call_me_now_clicked'
  | 'call_me_now_submitted'
  | 'claim_category_selected';

const IS_PROD = process.env.NODE_ENV === 'production';

// List of properties that should strictly be stripped before sending to a 3rd party
const PII_KEYS = ['name', 'phone', 'email', 'address'];

export const analytics = {
  track: (event: EventName, properties?: Record<string, any>) => {
    // 1. Strip PII for external providers
    const safeProps = properties ? { ...properties } : {};
    PII_KEYS.forEach(key => {
      if (key in safeProps) delete safeProps[key];
    });

    // 2. Log to console in Development
    if (!IS_PROD) {
      console.group(`[Analytics] ${event}`);
      console.log('Timestamp:', new Date().toISOString());
      if (properties) console.log('Raw Properties (Dev Only):', properties);
      console.log('Safe Properties:', safeProps);
      console.groupEnd();
      return;
    }

    // 3. Send to Provider (e.g., PostHog/GA4) in Production
    // if (window.posthog) {
    //     window.posthog.capture(event, safeProps);
    // }
  },
};
