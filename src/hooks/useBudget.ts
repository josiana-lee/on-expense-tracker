import { useLiveQuery } from 'dexie-react-hooks';
import { getCategoryBudgets, getMonthlyBudget } from '../db/budgets';
import type { DateStr } from '../db/types';

export function useMonthlyBudget(periodStart: DateStr) {
  return useLiveQuery(() => getMonthlyBudget(periodStart), [periodStart]);
}

export function useCategoryBudgets(periodStart: DateStr) {
  return useLiveQuery(() => getCategoryBudgets(periodStart), [periodStart]) ?? [];
}
