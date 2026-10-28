'use client';
import { useActionState, useEffect, useState } from 'react';
import { initialState } from './action-input';
import { operationKey, retainedOperationId } from './operation-identity';

export default function Command({ action, runId, scenario }) {
  const [state, dispatch, pending] = useActionState(action, initialState);
  const [operationId, setOperationId] = useState('');
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    try {
      setOperationId(
        retainedOperationId(sessionStorage, operationKey(runId, scenario), () =>
          crypto.randomUUID()
        )
      );
    } catch {
      setStorageError(true);
    }
  }, [runId, scenario.profile, scenario.claimId, scenario.targetMode, scenario.staffId]);
  return (
    <section>
      <p>Qualification only. Retry retains the same operation identity.</p>
      <form action={dispatch}>
        <input type="hidden" name="claimId" value={scenario.claimId} />
        <input type="hidden" name="operationId" value={operationId} data-testid="operation-id" />
        <input type="hidden" name="targetMode" value={scenario.targetMode} />
        {scenario.targetMode === 'value' && (
          <input type="hidden" name="staffId" value={scenario.staffId} />
        )}
        <button
          type="submit"
          disabled={pending || !operationId || storageError}
          data-testid="execute"
        >
          {pending
            ? 'Pending'
            : state.outcome === 'indeterminate'
              ? 'Retry same operation'
              : 'Execute fixture assignment'}
        </button>
      </form>
      {storageError && <p role="alert">Operation identity storage unavailable; no command sent.</p>}
      <output data-testid="action-result">{JSON.stringify(state)}</output>
    </section>
  );
}
