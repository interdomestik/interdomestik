'use client';

import { useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  // Read initial value from window.localStorage
  // See: https://usehooks-ts.com/react-hook/use-local-storage
  const readValue = (): T => {
    // Prevent build error "window is undefined" but keep keep working
    if (typeof globalThis === 'undefined') {
      return initialValue;
    }

    try {
      const item = globalThis.localStorage.getItem(key);
      // Parse stored json or if none return initialValue
      try {
        try {
          return item ? JSON.parse(item) : initialValue;
        } catch {
          return initialValue;
        }
      } catch {
        return initialValue;
      }
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  };

  const [storedValue, setStoredValue] = useState<T>(readValue);

  // Return a wrapped version of useState's setter function that ...
  // ... persists the new value to localStorage.
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // Allow value to be a function so we have same API as useState
      const valueToStore =
        typeof value === 'function' ? (value as (val: T) => T)(storedValue) : value;

      // Save state
      setStoredValue(valueToStore);

      // Save to local storage
      if (typeof globalThis !== 'undefined') {
        globalThis.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue] as const;
}
