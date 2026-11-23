import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android app (Capacitor). The app loads the live site, so web changes reach
 * phones as soon as they deploy to Vercel; only native changes need a new upload.
 *
 * appId is permanent once the app is uploaded to Google Play.
 */
const devUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "dev.dayboard.app",
  appName: "DayBoard",
  // Bundled files: only the offline page shown when dayboard.dev can't load.
  webDir: "capacitor-www",
  server: {
    // To test unreleased changes on the emulator, sync with CAP_SERVER_URL=http://10.0.2.2:3000 (your dev server).
    url: devUrl ?? "https://dayboard.dev",
    cleartext: Boolean(devUrl?.startsWith("http:")),
    errorPath: "index.html"
  },
  android: {
    backgroundColor: "#f4f3ee"
  },
  plugins: {
    SystemBars: {
      // The site uses viewport-fit=cover; telling Android up front avoids a layout jump on launch.
      initialViewportFitValueHint: "cover"
    },
    LocalNotifications: {
      // White logo in android/app/src/main/res/drawable/ic_stat_dayboard.xml
      smallIcon: "ic_stat_dayboard",
      iconColor: "#0d0d0f"
    }
  }
};

export default config;
