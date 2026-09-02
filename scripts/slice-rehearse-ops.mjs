import { must } from './slice-rehearse-canonical.mjs';
import { buildSafeOperation } from './slice-rehearse-operation-certificate.mjs';
import {
  executeOperation,
  readLiveOperationAuthority,
  readLiveOperationFacts,
  reconcileOperation,
  verifyLiveOperationFacts,
  verifyOperationAuthority,
  verifyOperationBody,
} from './slice-rehearse-operation-live.mjs';

export { buildSafeOperation } from './slice-rehearse-operation-certificate.mjs';

export function runSafeOperation(
  request,
  {
    readLiveFacts = readLiveOperationFacts,
    readAuthority = readLiveOperationAuthority,
    execute = executeOperation,
    reconcile = reconcileOperation,
  } = {}
) {
  const command = buildSafeOperation(request);
  verifyLiveOperationFacts(
    readLiveFacts(request, command.certificate),
    command.certificate,
    request.operation
  );
  verifyOperationAuthority(
    readAuthority(command.boundary, command.certificate),
    command.certificate
  );
  verifyOperationBody(request, command.certificate);
  const result = execute(command.binary, command.args);
  const reconciliation = reconcile(request, command.certificate);
  must(
    ['applied', 'not_applied', 'unknown'].includes(reconciliation?.outcome),
    'mutation reconciliation outcome is invalid'
  );
  if (result.status === 0) {
    must(
      reconciliation.outcome === 'applied',
      'successful mutation lacks an applied postcondition'
    );
    return { status: 'succeeded', command, reconciliation };
  }
  return {
    status: `failed_${reconciliation.outcome}`,
    command,
    reconciliation,
    error: typeof result.stderr === 'string' ? result.stderr.trim() : null,
  };
}
