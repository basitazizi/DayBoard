import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android app (Capacitor). The app loads the live site, so web changes reach
 * phones as soon as they deploy to Vercel; only native changes need a new upload.
 *
 * appId is permanent once the app is uploaded to Google Play.
 */
const config: CapacitorConfig = {
  appId: "dev.dayboard.app",
  appName: "DayBoard",
  // Bundled files: only the offline page shown when dayboard.dev can't load.
  webDir: "capacitor-www",
  server: {
    url: "https://dayboard.dev",
    errorPath: "index.html"
  },
  android: {
    backgroundColor: "#f4f3ee"
  },
  plugins: {
    LocalNotifications: {
      // White logo in android/app/src/main/res/drawable/ic_stat_dayboard.xml
      smallIcon: "ic_stat_dayboard",
      iconColor: "#0d0d0f"
    }
  }
};

export default config;
