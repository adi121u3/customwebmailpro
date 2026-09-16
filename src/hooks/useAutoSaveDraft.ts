import { useEffect, useRef } from 'react';

export function useAutoSaveDraft(onSave: () => void, deps: any[], delay: number = 30_000) {
  const callbackRef = useRef(onSave);

  useEffect(() => {
    callbackRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    const timer = setTimeout(() => {
      callbackRef.current();
    }, delay);

    return () => clearTimeout(timer);
  }, [...deps, delay]);
}
