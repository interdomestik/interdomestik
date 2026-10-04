import { useEffect, useState, type MouseEvent } from 'react';

import { isOrdinaryActivation } from './free-start-intake-shell/arrival-navigation';
import { dispatchPublicEntryIntent } from './public-entry-intent';

export function usePublicEntryActivation(category: 'vehicle' | 'property') {
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return {
    ready,
    onClick: (event: MouseEvent<HTMLAnchorElement>) => {
      if (isOrdinaryActivation(event)) dispatchPublicEntryIntent(category);
    },
  };
}
