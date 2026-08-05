import type { CapacitorConfig } from '@capacitor/cli';

// Same source the UI and the PWA manifest read, so the native app's label
// can't drift from the name shown inside it.
import { APP_INFO } from './src/data/appInfo';

const config: CapacitorConfig = {
  /* Permanent once the listing goes live — Play identifies the app by this
     string forever and will not let it change. */
  appId: 'com.jdblabs.onexpense',
  appName: APP_INFO.appName,
  webDir: 'dist',

  android: {
    /* The app is a private ledger with no server and no login, so there is
       nothing for a debug bridge to help with in a release build, and it
       would expose the user's IndexedDB to anything that can reach the
       device over adb. */
    webContentsDebuggingEnabled: false,
  },

  /* No SplashScreen plugin. The Android launch theme already shows a splash
     until the WebView paints its first frame, and that is exactly as long as
     it should last: the app's whole premise is being ready to type an amount
     in three seconds, and the plugin's only real offering here is holding the
     splash open for longer than necessary.

     The images come from assets/splash*.png via `pnpm android:icons`; the
     theme wiring is in android/app/src/main/res/values{,-v31}/styles.xml. */
};

export default config;
