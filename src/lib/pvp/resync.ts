type ResyncSurface = {
  window: EventTarget;
  document: EventTarget;
  visible: () => boolean;
  online: () => boolean;
  now: () => number;
  interval: (callback: () => void, ms: number) => () => void;
};

// Read-only resync: never sends an answer or restarts the server deadline.
export function attachPvpResync(refresh: () => void, surface: ResyncSurface) {
  let active = true;
  let lastSync = -Infinity;
  const sync = () => {
    if (!active || !surface.visible() || !surface.online() || surface.now() - lastSync < 1000) return;
    lastSync = surface.now();
    refresh();
  };
  surface.window.addEventListener('focus', sync);
  surface.window.addEventListener('online', sync);
  surface.document.addEventListener('visibilitychange', sync);
  const stopInterval = surface.interval(sync, 30_000);
  return () => {
    active = false;
    stopInterval();
    surface.window.removeEventListener('focus', sync);
    surface.window.removeEventListener('online', sync);
    surface.document.removeEventListener('visibilitychange', sync);
  };
}
