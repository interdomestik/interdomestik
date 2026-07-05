import { trackEvent } from '@/lib/analytics';

type HelpNowEventName =
  | 'help_now_opened'
  | 'checklist_item_done'
  | 'trip_pack_downloaded'
  | 'evidence_bundle_created'
  | 'claim_pack_generated';

type HelpNowEventProps = {
  country?: string;
  offline?: boolean;
  scenario?: 'car' | 'injury' | 'property' | 'flight';
  item_index?: number;
  checklist_type?: 'scene' | 'trip';
  item_count_bucket?: '0' | '1_2' | '3_5' | '6_plus';
  camera_denied?: boolean;
  pack_count?: number;
  total_mb_bucket?: 'under_1' | '1_3' | 'over_3';
  has_bundle?: boolean;
};

const ALLOWED_KEYS = new Set([
  'country',
  'offline',
  'scenario',
  'item_index',
  'checklist_type',
  'item_count_bucket',
  'camera_denied',
  'pack_count',
  'total_mb_bucket',
  'has_bundle',
]);

export function trackHelpNowEvent(event: HelpNowEventName, props: HelpNowEventProps = {}) {
  const safeProps = Object.fromEntries(
    Object.entries(props).filter(([key, value]) => ALLOWED_KEYS.has(key) && value !== undefined)
  );

  trackEvent(event, safeProps);
}
