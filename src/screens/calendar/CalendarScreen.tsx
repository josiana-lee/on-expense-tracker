import { useCallback, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Toast } from '../../components/Toast';
import { fmt, parseDateStr } from '../../db/date';
import { installmentLabel } from '../../db/installments';
import type { ExpenseRecord } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { useDateExpenses } from '../../hooks/useExpenses';
import { useMonth } from '../../hooks/useMonth';
import { useSettings } from '../../hooks/useSettings';
import { useToast } from '../../hooks/useToast';
import { useToday } from '../../hooks/useToday';
import { dateText, won } from '../../lib/format';
import { EntrySheet } from './EntrySheet';
import { MonthPickerSheet } from './MonthPickerSheet';
import { SearchScreen } from './SearchScreen';
import styles from './CalendarScreen.module.css';

const CHEVRON_LEFT = 'M15 5l-7 7 7 7';
const CHEVRON_RIGHT = 'M9 5l7 7-7 7';
const SEARCH_ICON = 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.35-4.35';

const DOW_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

/** Tiers lifted from the mock. Tuned for a single person's daily spend, so a
 *  heavy day stands out without the whole month turning red. */
function heatClass(sum: number): string {
  if (sum >= 90_000) return styles.heat3;
  if (sum >= 50_000) return styles.heat2;
  if (sum >= 25_000) return styles.heat1;
  return '';
}

/** Cells are ~44px wide, so anything past four figures gets abbreviated.
 *
 *  `k` alone stopped working once amounts could reach 억: 20,318,054 came out
 *  as "20318k", which is both unreadable and wider than the cell. Korean
 *  amounts are grouped by 만 and 억 in speech, so the abbreviation follows
 *  that rather than thousands. */
export function cellAmount(sum: number): string {
  if (!sum) return '';
  if (sum < 10_000) return won(sum);

  /* Rounded first, then re-checked against the next unit. Testing the raw
     figure let 99,999,999 round up to "10000만" — five digits plus a unit,
     wider than the cell and a worse answer than the "1억" it is. */
  const man = Math.round(sum / 10_000);
  if (man < 10_000) return `${man}만`;

  const eok = sum / 100_000_000;
  return `${eok < 10 ? eok.toFixed(1).replace(/\.0$/, '') : Math.round(eok)}억`;
}

export function CalendarScreen() {
  const settings = useSettings();
  const weekStartDay = settings?.weekStartDay ?? 0;

  const today = useToday();
  const [view, setView] = useState(() => ({
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  }));
  const [selected, setSelected] = useState(() => fmt(today));

  const { totals, monthTotal } = useMonth(view.year, view.month);
  const { records, total: dayTotal } = useDateExpenses(selected);
  const { byId, paymentById } = useCatalog();
  const { text: toast, flash } = useToast();
  /** null = closed. `{ record: null }` opens the sheet in create mode. */
  const [sheet, setSheet] = useState<{ record: ExpenseRecord | null } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  /** 그 달로 옮기고 커서를 놓는다. 현재 달이면 오늘, 아니면 1일이다.
   *
   *  기록이 있는 첫 날로 옮겨봤다가 되돌렸다. 그러면 달을 넘길 때마다 커서가
   *  다른 자리에 떨어져서, 어디를 보고 있는지 매번 다시 찾아야 한다. 1일은
   *  어느 방향으로 넘기든 같은 자리다.
   *
   *  그 달 지출이 말일 하루뿐이면 "이번 달 지출 10만원"과 "이 날은 기록이
   *  없어"가 한 화면에 뜨는데, 이건 달력에 색이 든 칸이 어디인지 보면 풀린다.
   *  커서를 옮겨서 감추는 것보다 사용자가 직접 고르게 두는 쪽을 택했다. */
  const goToMonth = useCallback(
    (year: number, month: number) => {
      setView({ year, month });
      const isThisMonth = year === today.getFullYear() && month === today.getMonth() + 1;
      setSelected(fmt(isThisMonth ? today : new Date(year, month - 1, 1)));
    },
    [today],
  );

  const shiftMonth = (delta: number) => {
    const d = new Date(view.year, view.month - 1 + delta, 1);
    goToMonth(d.getFullYear(), d.getMonth() + 1);
  };

  /** Jumps the grid behind it to the found record's day, so closing the
   *  edit sheet lands somewhere that makes sense rather than wherever the
   *  view happened to be before the search. */
  const openFromSearch = (record: ExpenseRecord) => {
    const d = parseDateStr(record.date);
    setView({ year: d.getFullYear(), month: d.getMonth() + 1 });
    setSelected(record.date);
    setSearchOpen(false);
    setSheet({ record });
  };

  const dows = useMemo(
    () => Array.from({ length: 7 }, (_, i) => (weekStartDay + i) % 7),
    [weekStartDay],
  );

  const cells = useMemo(() => {
    const firstDow = new Date(view.year, view.month - 1, 1).getDay();
    const lead = (firstDow - weekStartDay + 7) % 7;
    const daysInMonth = new Date(view.year, view.month, 0).getDate();

    const out: Array<{ key: string; date: DateCell | null }> = [];
    for (let i = 0; i < lead; i++) out.push({ key: `blank-${i}`, date: null });
    for (let n = 1; n <= daysInMonth; n++) {
      const d = new Date(view.year, view.month - 1, n);
      out.push({ key: fmt(d), date: { n, dateKey: fmt(d), dow: d.getDay() } });
    }
    return out;
  }, [view, weekStartDay]);

  const todayKey = fmt(today);

  return (
    <div className={styles.screen}>
      <div className={styles.head}>
        <div className={styles.headTop}>
          <div className={styles.title}>
            <button
              type="button"
              className={styles.nav}
              onClick={() => shiftMonth(-1)}
              aria-label="이전 달"
            >
              <Icon path={CHEVRON_LEFT} size={19} stroke="currentColor" strokeWidth={2.2} />
            </button>
            <button
              type="button"
              className={styles.monthName}
              onClick={() => setMonthPickerOpen(true)}
              aria-label="년월 선택"
            >
              {view.year}년 {view.month}월
            </button>
            <button
              type="button"
              className={styles.nav}
              onClick={() => shiftMonth(1)}
              aria-label="다음 달"
            >
              <Icon path={CHEVRON_RIGHT} size={19} stroke="currentColor" strokeWidth={2.2} />
            </button>
          </div>
          <button
            type="button"
            className={styles.searchBtn}
            onClick={() => setSearchOpen(true)}
            aria-label="기록 검색"
          >
            <Icon path={SEARCH_ICON} size={19} stroke="currentColor" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className={styles.card}>
        {/* Sits on the grid it totals, and gets the card's full width — the
            month title and search button no longer have to share a line with
            it, which is what kept squeezing it. */}
        <div className={styles.cardTotal}>
          <span className={styles.cardTotalLabel}>이번 달 지출</span>
          <span className={`${styles.cardTotalValue} tabular`}>{won(monthTotal)}원</span>
        </div>
        <div className={styles.dows}>
          {dows.map((d) => (
            <div key={d} className={`${styles.dow} ${d === 0 ? styles.sunday : ''}`}>
              {DOW_NAMES[d]}
            </div>
          ))}
        </div>
        <div className={styles.days}>
          {cells.map(({ key, date }) =>
            date === null ? (
              <div key={key} className={styles.blank} />
            ) : (
              <button
                key={key}
                type="button"
                onClick={() => setSelected(date.dateKey)}
                aria-label={`${view.month}월 ${date.n}일`}
                aria-pressed={selected === date.dateKey}
                className={[
                  styles.day,
                  selected === date.dateKey ? styles.selected : heatClass(totals.get(date.dateKey)?.expense ?? 0),
                  date.dateKey === todayKey ? styles.today : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <span
                  className={`${styles.dayNum} ${
                    date.dow === 0 && selected !== date.dateKey ? styles.sundayNum : ''
                  }`}
                >
                  {date.n}
                </span>
                <span className={`${styles.daySum} tabular`}>
                  {cellAmount(totals.get(date.dateKey)?.expense ?? 0)}
                </span>
              </button>
            ),
          )}
        </div>
      </div>

      <div className={styles.dayHead}>
        <span className={styles.dayHeadLabel}>{dateText(parseDateStr(selected))}</span>
        <div className={styles.dayHeadRight}>
          <span className={`${styles.dayHeadTotal} tabular`}>{won(dayTotal)}원</span>
          {/* The input tab only ever records "now", so back-dating a forgotten
              expense — or pencilling in a future one — happens here. */}
          <button
            type="button"
            className={styles.add}
            onClick={() => setSheet({ record: null })}
            aria-label="이 날짜에 기록 추가"
          >
            <Icon path="M12 5v14M5 12h14" size={17} stroke="currentColor" strokeWidth={2.4} />
            추가
          </button>
        </div>
      </div>

      <div className={styles.list}>
        <div className={styles.listCard}>
          {records.length === 0 ? (
            <p className={styles.empty}>이 날은 기록이 없어</p>
          ) : (
            records.map((r) => {
              const cat = byId.get(r.categoryId);
              const pay = paymentById.get(r.paymentMethodId);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={styles.row}
                  onClick={() => setSheet({ record: r })}
                >
                  <span className={styles.rowBadge} style={{ background: cat?.colorHex }}>
                    {cat && <Icon path={cat.iconPath} size={19} strokeWidth={1.8} />}
                  </span>
                  <div className={styles.rowMain}>
                    <div className={styles.rowName}>{r.subLabel || cat?.name}</div>
                    <div className={styles.rowSub}>
                      {/* The category name is only worth repeating underneath
                          when the title above is a sub-label instead. */}
                      {/* 할부 회차를 제일 앞에 둔다. 이 줄에서 사용자가
                          찾는 건 "이 4십만원은 왜 여기 있지?"의 답이다. */}
                      {[installmentLabel(r), r.memo, r.subLabel ? cat?.name : null, pay?.name]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <div className={styles.rowRight}>
                    <div className={`${styles.rowAmount} tabular`}>{won(r.amount)}원</div>
                    <div className={styles.rowTime}>{r.time}</div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {sheet && (
        <EntrySheet
          record={sheet.record}
          date={selected}
          onClose={() => setSheet(null)}
          onDone={flash}
        />
      )}

      {searchOpen && (
        <SearchScreen onBack={() => setSearchOpen(false)} onSelectRecord={openFromSearch} />
      )}

      {monthPickerOpen && (
        <MonthPickerSheet
          year={view.year}
          month={view.month}
          onClose={() => setMonthPickerOpen(false)}
          onPick={(year, month) => {
            // 좌우 화살표와 같은 규칙 — goToMonth가 갖고 있다.
            goToMonth(year, month);
            setMonthPickerOpen(false);
          }}
        />
      )}

      {toast && <Toast key={toast} text={toast} />}
    </div>
  );
}

type DateCell = { n: number; dateKey: string; dow: number };
