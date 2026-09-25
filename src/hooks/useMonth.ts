import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { fmt } from '../db/date';
import { groupByDate, loadRange, sumByCategory, sumExpenses, type DayTotals } from '../db/expenses';
import type { DateStr } from '../db/types';

const EMPTY: Map<DateStr, DayTotals> = new Map();

/** One calendar month of records, read in a single indexed range scan and
 *  grouped in memory — a month is a few hundred rows, and a rollup table
 *  would make every write path responsible for keeping the calendar honest. */
export function useMonth(year: number, month1to12: number) {
  const from = fmt(new Date(year, month1to12 - 1, 1));
  const to = fmt(new Date(year, month1to12, 0));

  const rows = useLiveQuery(() => loadRange(from, to), [from, to]);

  const totals = useMemo(() => (rows ? groupByDate(rows) : EMPTY), [rows]);
  /* 아직 안 읽힌 달은 빈 배열로 친다. `rows ? … : 0`으로 두면 0이 그냥
     number라 반환 타입이 Minor를 잃고, 받는 쪽에서 다시 단언하게 된다. */
  const monthTotal = useMemo(() => sumExpenses(rows ?? []), [rows]);
  /* 같은 스캔에서 파생시킨다. 카테고리 요약을 위해 달을 한 번 더 읽으면 두
     숫자가 서로 다른 시점을 보게 되고, 총액과 목록의 합이 어긋나는 순간이
     생긴다 — 둘이 같은 화면에 있어서 그게 바로 보인다. */
  const byCategory = useMemo(() => sumByCategory(rows ?? []), [rows]);

  return { totals, monthTotal, byCategory, loading: rows === undefined };
}
