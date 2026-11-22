import type { MetadataRoute } from "next";

/** Web app manifest: lets DayBoard install to a phone home screen, and is the starting point for the Android app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "DayBoard",
    short_name: "DayBoard",
    description: "A planner for students: calendar, tasks, classes, habits and focus in one place.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f4f3ee",
    theme_color: "#0d0d0f",
    categories: ["productivity", "education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
