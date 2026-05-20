import { useState, useEffect } from 'react';

/**
 * Debounce hook — değer belirtilen süreden sonra güncellenir
 * Arama ve filtre işlemleri için ideal
 */
export function useDebouncedValue(value, delayMs = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debouncedValue;
}
