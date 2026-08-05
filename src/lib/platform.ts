import { Capacitor } from '@capacitor/core';

/** True inside the Android (or iOS) wrapper, false in a browser.
 *
 *  Every native capability in this app is reached through a branch on this,
 *  and the browser branch stays working rather than degrading to a stub. The
 *  dev server is where the app is actually built and looked at — a web path
 *  that only pretends to work would move every mistake to the one place
 *  nobody checks until the APK is on a phone. */
export const isNative = Capacitor.isNativePlatform();
