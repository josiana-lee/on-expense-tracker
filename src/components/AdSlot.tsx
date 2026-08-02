import styles from './AdSlot.module.css';

/** Reserved banner space. The real network (AdMob via Capacitor, or AdSense
 *  under a TWA) gets wired in when packaging is decided — see design-brief §6.
 *
 *  Deliberately sits above the save button with the today's-records card
 *  between them: a banner flush against the primary CTA collects accidental
 *  taps, which is both a bad experience and AdMob invalid-traffic exposure. */
export function AdSlot() {
  return (
    <div className={styles.slot} aria-hidden="true">
      <span className={styles.label}>광고 영역</span>
    </div>
  );
}
