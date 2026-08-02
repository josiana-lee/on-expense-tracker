import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { fmt } from '../db/date';
import { groupByDate, loadRange, sumExpenses, type DayTotals } from '../db/expenses';
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
  const monthTotal = useMemo(() => (rows ? sumExpenses(rows) : 0), [rows]);

  return { totals, monthTotal, loading: rows === undefined };
}
