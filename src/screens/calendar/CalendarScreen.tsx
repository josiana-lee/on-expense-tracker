import { useCallback, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { Toast } from '../../components/Toast';
import { fmt, parseDateStr } from '../../db/date';
import { installmentLabel } from '../../db/installments';
import type { ExpenseRecord } from '../../db/types';
import { useCatalog } from '../../hooks/useCatalog';
import { loadRange } from '../../db/expenses';
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

  /** 늦게 도착한 응답이 그 사이 또 넘긴 달의 커서를 덮어쓰지 않게 한다. */
  const jumpToken = useRef(0);

  /** 그 달로 옮기고 커서를 놓는다.
   *
   *  현재 달이면 오늘. 다른 달이면 **기록이 있는 첫 날**이다. 예전에는 늘
   *  1일이었는데, 지출이 말일 하루뿐인 달에서 "이번 달 지출 10만원"과 "이 날은
   *  기록이 없어"가 같은 화면에 떠서 고장으로 읽혔다. 달을 넘기는 사람이
   *  보려는 건 1일이 아니라 그 달에 뭘 썼는지다.
   *
   *  useMonth의 totals를 쓰지 않고 따로 한 번 읽는 이유: 달을 막 바꾼 시점에
   *  그 값은 아직 이전 달 것이라, 갱신을 기다리는 조건을 두면 "비어 있어서
   *  없는 것"과 "아직 안 와서 없는 것"을 구분해야 한다. 같은 인덱스 레인지
   *  스캔 한 번이 그 분기보다 싸다. */
  const goToMonth = useCallback(
    (year: number, month: number) => {
      setView({ year, month });

      const isThisMonth = year === today.getFullYear() && month === today.getMonth() + 1;
      const first = new Date(year, month - 1, 1);
      setSelected(fmt(isThisMonth ? today : first));
      if (isThisMonth) return;

      const token = ++jumpToken.current;
      loadRange(fmt(first), fmt(new Date(year, month, 0)))
        .then((rows) => {
          if (jumpToken.current !== token) return;
          const days = rows.map((r) => r.date).sort();
          if (days[0]) setSelected(days[0]);
        })
        /* 커서를 옮기지 못했을 뿐이라 1일에 그대로 머문다. 달력 자체는
           useMonth가 따로 그린다. */
        .catch(() => {});
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
