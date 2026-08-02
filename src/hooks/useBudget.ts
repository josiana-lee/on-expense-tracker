import { useLiveQuery } from 'dexie-react-hooks';
import { getMonthlyBudget } from '../db/budgets';
import type { DateStr } from '../db/types';

export function useMonthlyBudget(periodStart: DateStr) {
  return useLiveQuery(() => getMonthlyBudget(periodStart), [periodStart]);
}
