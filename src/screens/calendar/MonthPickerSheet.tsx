import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { Sheet } from '../../components/Sheet';
import styles from './MonthPickerSheet.module.css';

const CHEVRON_LEFT = 'M15 5l-7 7 7 7';
const CHEVRON_RIGHT = 'M9 5l7 7-7 7';

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

type Props = {
  year: number;
  month: number;
  onPick: (year: number, month: number) => void;
  onClose: () => void;
};

/** Jumps the calendar to any month.
 *
 *  The chevrons beside the title move one month at a time, which is right for
 *  "last month" and useless for "this time last year" — twelve taps, and the
 *  grid redrawing on each one. Here a year is one tap and a month is one more.
 *
 *  The year being browsed is local state: paging through years to look for a
 *  month should not move the calendar underneath until something is actually
 *  chosen. */
export function MonthPickerSheet({ year, month, onPick, onClose }: Props) {
  const [browseYear, setBrowseYear] = useState(year);
  const today = new Date();
  const thisYear = today.getFullYear();
  const thisMonth = today.getMonth() + 1;

  return (
    <Sheet label="년월 선택" onClose={onClose}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.nav}
          onClick={() => setBrowseYear((y) => y - 1)}
          aria-label="이전 해"
        >
          <Icon path={CHEVRON_LEFT} size={19} stroke="currentColor" strokeWidth={2.2} />
        </button>
        <span className={styles.year}>{browseYear}년</span>
        <button
          type="button"
          className={styles.nav}
          onClick={() => setBrowseYear((y) => y + 1)}
          aria-label="다음 해"
        >
          <Icon path={CHEVRON_RIGHT} size={19} stroke="currentColor" strokeWidth={2.2} />
        </button>
      </div>

      <div className={styles.grid}>
        {MONTHS.map((m) => {
          const selected = browseYear === year && m === month;
          const isThisMonth = browseYear === thisYear && m === thisMonth;
          return (
            <button
              key={m}
              type="button"
              className={[
                styles.month,
                selected ? styles.selected : '',
                !selected && isThisMonth ? styles.current : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-pressed={selected}
              onClick={() => onPick(browseYear, m)}
            >
              {m}월
            </button>
          );
        })}
      </div>

      {/* Getting back is otherwise as many taps as leaving was. */}
      <button
        type="button"
        className={styles.today}
        onClick={() => onPick(thisYear, thisMonth)}
      >
        이번 달로
      </button>
    </Sheet>
  );
}
