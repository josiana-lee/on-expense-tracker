import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { fmt } from '../db/date';
import { listByDate, sumExpenses } from '../db/expenses';
import type { DateStr } from '../db/types';

/** Records for one calendar day, kept live — any write to `expenses`
 *  re-runs the query, so the list and total update without manual wiring. */
export function useDateExpenses(dateKey: DateStr) {
  const records = useLiveQuery(() => listByDate(dateKey), [dateKey]);
  const total = useMemo(() => (records ? sumExpenses(records) : 0), [records]);

  return {
    records: records ?? [],
    total,
    /** Distinguishes "no records" from "not read yet" so the empty state
     *  doesn't flash on first paint. */
    loading: records === undefined,
  };
}

export function useDayExpenses(day: Date) {
  return useDateExpenses(fmt(day));
}
