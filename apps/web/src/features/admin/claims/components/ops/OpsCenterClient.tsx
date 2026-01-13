// Phase 2.8: Ops Center Client Component (handles drawer state)
'use client';

import { useState } from 'react';

import type { ClaimOperationalRow } from '../../types';
import { ClaimPreviewDrawer } from './ClaimPreviewDrawer';

interface OpsCenterClientProps {
  claims: ClaimOperationalRow[];
}

/**
 * OpsCenterClient — Client-side state for preview drawer.
 * Minimal client component to handle row selection.
 */
export function OpsCenterClient({ claims: _claims }: OpsCenterClientProps) {
  const [selectedClaim, setSelectedClaim] = useState<ClaimOperationalRow | null>(null);

  return <ClaimPreviewDrawer claim={selectedClaim} onClose={() => setSelectedClaim(null)} />;
}
