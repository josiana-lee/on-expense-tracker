/* Publisher details and legal links shown in the settings footer.
 *
 * Everything here is a real-world fact this repo can't invent, so each field
 * starts empty and the footer skips whatever is still blank — better a
 * missing row than a link that 404s in production or a company name that
 * isn't the one on the listing.
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
  /** Shown as the copyright line, e.g. "© 2026 <name>". */
  companyName: 'JDB Labs',

  /** Credited under the copyright line. */
  author: 'KENTO.LEE',

  /** Play Store requires this to be live before the listing is approved. */
  privacyPolicyUrl: '',

  termsUrl: '',

  /** Rendered as a mailto: row so a user can reach support from inside the app. */
  supportEmail: '',

  /** Bumped by hand at release; also stamped into backup files by
   *  db/backup.ts's APP_VERSION, which should move with it. */
  version: '0.1.0',
} as const;
