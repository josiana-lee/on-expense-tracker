import { useEffect, useState } from 'react';

/** Live clock for the input screen header. Ticks on the minute boundary rather
 *  than every 60s from mount, so the displayed minute flips when the real one
 *  does. Also resyncs when the app comes back from the background, where
 *  timers are throttled or suspended. */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let interval: number | undefined;

    const tick = () => setNow(new Date());

    const msToNextMinute = 60_000 - (Date.now() % 60_000);
    const timeout = window.setTimeout(() => {
      tick();
      interval = window.setInterval(tick, 60_000);
    }, msToNextMinute);

    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearTimeout(timeout);
      if (interval) window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return now;
}
