import { readPilotSwitch } from '../pilot-switch';
import { withFreeStartDraftContext } from './context';
import type { FreeStartDraftContext } from './contracts';

export function readFreeStartDraftIntakeOpen(context: FreeStartDraftContext): Promise<boolean> {
  return withFreeStartDraftContext(context, async tx => {
    const decision = await readPilotSwitch(tx, context.accessTenantId, 'public_intake');
    return decision.state === 'open';
  });
}
