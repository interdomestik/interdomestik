'use client';

import { useEffect, useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  // Read initial value from window.localStorage
  // See: https://usehooks-ts.com/react-hook/use-local-storage
  const readValue = (): T => {
    // Prevent SSR errors when localStorage is unavailable
    if (typeof window === 'undefined' || typeof globalThis.localStorage === 'undefined') {
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

  // State to store our value
  // Pass initial state function to useState so logic is only executed once
  // Initialize with initialValue on server to match hydration
  const [storedValue, setStoredValue] = useState<T>(initialValue);

  // Use effect to update state with localStorage value on client mount
  useEffect(() => {
    setStoredValue(readValue());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run once on mount

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
      if (typeof window !== 'undefined' && typeof globalThis.localStorage !== 'undefined') {
        globalThis.localStorage.setItem(key, JSON.stringify(valueToStore));
      }
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue] as const;
}
