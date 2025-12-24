'use client';

import React from 'react';
import ReactDOM from 'react-dom';

// Module-level flag to ensure axe-core only initializes once
let axeInitialized = false;

export function AxeProvider() {
  React.useEffect(() => {
    // Only run in development, on client, and if not already initialized
    if (process.env.NODE_ENV !== 'production' && typeof window !== 'undefined' && !axeInitialized) {
      axeInitialized = true;

      // Wait for initial animations to complete before starting axe-core
      const timeoutId = setTimeout(() => {
        import('@axe-core/react')
          .then(axe => {
            const axeFunc = axe.default || axe;
            if (typeof axeFunc === 'function') {
              // 2000ms debounce - wait for animations to settle
              axeFunc(React, ReactDOM, 2000);
            }
          })
          .catch(err => {
            console.warn('Failed to load @axe-core/react', err);
          });
      }, 1500); // Wait 1.5s after mount for initial animations

      return () => clearTimeout(timeoutId);
    }
  }, []);

  return null;
}
