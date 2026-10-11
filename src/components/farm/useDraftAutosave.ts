"use client";
import { useCallback, useEffect, useRef } from "react";
/** Debounce edits, serialize requests, and flush a pending edit on screen exit. */
export function useDraftAutosave<T>(
  value: T,
  save?: (value: T) => Promise<void>,
) {
  const callback = useRef(save),
    pending = useRef<T | undefined>(undefined),
    queue = useRef(Promise.resolve());
  const initial = useRef(true);
  useEffect(() => {
    callback.current = save;
  }, [save]);
  const flush = useCallback(() => {
    const draft = pending.current;
    pending.current = undefined;
    if (draft === undefined || !callback.current) return;
    const fn = callback.current;
    queue.current = queue.current.catch(() => {}).then(() => fn(draft));
    void queue.current.catch(() => {});
  }, []);
  useEffect(() => {
    if (initial.current) {
      initial.current = false;
      return;
    }
    pending.current = value;
    const timer = setTimeout(flush, 300);
    return () => clearTimeout(timer);
  }, [value, flush]);
  useEffect(() => () => flush(), [flush]);
}
