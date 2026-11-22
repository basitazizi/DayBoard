"use client";

import { useEffect } from "react";

/** Registers the offline screen in production builds only, so local development never serves stale pages. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => console.warn("Offline support is unavailable.", error));
  }, []);
  return null;
}
