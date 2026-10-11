"use client";
import { useCallback, useEffect, useRef, useState } from "react";
/** Debounce edits, serialize requests, and flush a pending edit on screen exit. */
export function useDraftAutosave<T>(
  value: T,
  save?: (value: T) => Promise<void>,
) {
  const callback = useRef(save),
    pending = useRef<T | undefined>(undefined),
    queue = useRef(Promise.resolve());
  const initial = useRef(true);
  const [failure, setFailure] = useState<string | null>(null);
  useEffect(() => {
    callback.current = save;
  }, [save]);
  const flush = useCallback(() => {
    const draft = pending.current;
    pending.current = undefined;
    if (draft === undefined || !callback.current) return;
    const fn = callback.current;
    queue.current = queue.current
      .catch(() => {})
      .then(async () => {
        await fn(draft);
        setFailure(null);
      });
    void queue.current.catch((error) =>
      setFailure(
        error instanceof Error
          ? error.message
          : "บันทึกผังไม่สำเร็จ กรุณาลองอีกครั้ง",
      ),
    );
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
  return failure;
}
