import { useSyncExternalStore } from "react";

let clientReady = false;
let didSchedule = false;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(onStoreChange: () => void) {
  listeners.add(onStoreChange);
  if (typeof window === "undefined") {
    return () => {
      listeners.delete(onStoreChange);
    };
  }
  if (clientReady) {
    queueMicrotask(() => onStoreChange());
  } else if (!didSchedule) {
    didSchedule = true;
    queueMicrotask(() => {
      clientReady = true;
      notify();
    });
  }
  return () => {
    listeners.delete(onStoreChange);
  };
}

/**
 * After hydration, becomes true on the client so UA-dependent UI can run without
 * SSR/client markup mismatch. Server and first client paint both see `false`.
 */
export function useClientReady(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => clientReady,
    () => false
  );
}
