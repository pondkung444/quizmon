"use client";

import { useEffect } from 'react';
import { attachPvpResync } from './resync';

export function usePvpResync(refresh: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    return attachPvpResync(refresh, {
      window, document,
      visible: () => document.visibilityState === 'visible',
      online: () => navigator.onLine,
      now: () => Date.now(),
      interval: (callback, ms) => {
        const timer = window.setInterval(callback, ms);
        return () => window.clearInterval(timer);
      },
    });
  }, [refresh, enabled]);
}
