export type OpsTimelineTone = 'neutral' | 'success' | 'warning' | 'danger';

/**
 * Maps common action tones or status types to OpsTimeline tones.
 */
export function toOpsTimelineTone(input: string | undefined | null): OpsTimelineTone {
  if (!input) return 'neutral';

  const tone = input.toLowerCase();

  if (['success', 'approved', 'verified', 'completed', 'verified_claim'].includes(tone))
    return 'success';
  if (['warning', 'waiting', 'under_review', 'past_due'].includes(tone)) return 'warning';
  if (['danger', 'rejected', 'failed', 'error', 'cancelled'].includes(tone)) return 'danger';
  if (['info', 'pending', 'in_progress', 'started', 'created', 'assigned'].includes(tone))
    return 'neutral';

  return 'neutral';
}
