/**
 * Umami Analytics Helper Utility
 *
 * Provides safe, crash-proof custom event tracking for Cerin & Chris's Wedding Album.
 * If Umami is not configured (or blocked by browser privacy tools), calls safely no-op.
 */

declare global {
  interface Window {
    umami?: {
      track: (eventName: string, eventData?: Record<string, unknown>) => void;
    };
  }
}

export function trackEvent(eventName: string, eventData?: Record<string, unknown>) {
  if (typeof window !== "undefined" && window.umami && typeof window.umami.track === "function") {
    try {
      window.umami.track(eventName, eventData);
    } catch (err) {
      console.warn("[Analytics] Tracking error:", err);
    }
  }
}
