/* The app's identity: its name, publisher, and the legal links shown in the
 * settings footer. Single source of truth — vite.config.ts reads the names
 * for the PWA manifest too, so the launcher and the UI can't drift apart.
 *
 * The URLs are real-world facts this repo can't invent, so they start empty
 * and the footer skips whatever is still blank — better a missing row than a
 * link that 404s in production.
 *
 * privacyPolicyUrl is not optional in practice: Google Play requires a
 * reachable privacy policy URL for any app that touches personal or
 * financial data, and this one stores the user's spending. The store
 * listing will be rejected without it.
 *
 * Terms and the open-source notice are conventional rather than required.
 * The licence page matters once the app ships with bundled dependencies —
 * Dexie (Apache-2.0), React (MIT) and Zod (MIT) all ask for attribution. */

export const APP_INFO = {
  /** Display name, for UI copy and the store listing. */
  appName: '온:On 지출 가계부',

  /** Launcher label. Android truncates a home-screen caption at roughly a
   *  dozen characters, so the full name would be cut mid-word. */
  shortName: '온:On 가계부',

  /** Filename-safe form of the name, for backup and CSV exports. The colon
   *  is dropped deliberately: Windows forbids it outright and Finder reads it
   *  as a path separator, and these files get shared out to Drive, email and
   *  desktops rather than staying on the phone. */
  fileName: '온On',

  /** Shown as the copyright line, e.g. "© 2026 <name>". */
  companyName: 'JDB Labs',

  /** For the privacy policy and terms documents, which name a responsible
   *  person — deliberately not in the footer, where the company alone is the
   *  publisher. */
  author: 'KENTO.LEE',

  /** Play Store requires this to be live before the listing is approved.
   *
   *  Generated from docs/privacy-policy.md and served out of the separate
   *  public jdb-labs-policies repo — this repo is private, and Pages will not
   *  serve a private one. See docs/release-checklist.md. */
  privacyPolicyUrl: 'https://josiana-lee.github.io/jdb-labs-policies/on-expense/',

  termsUrl: '',

  /** Rendered as a mailto: row so a user can reach support from inside the
   *  app. Shared across JDB Labs apps rather than per-app, so a user who has
   *  more than one of ours writes to the same place. */
  supportEmail: 'jdblabskento@gmail.com',

  /** Bumped by hand at release; also stamped into backup files by
   *  db/backup.ts's APP_VERSION, which should move with it. */
  version: '1.0.0',
} as const;
