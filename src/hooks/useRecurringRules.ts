import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { RecurringRuleRecord } from '../db/types';

export function useRecurringRules(): RecurringRuleRecord[] {
  const rules = useLiveQuery(() => db.recurringRules.toArray(), []);
  return (rules ?? []).slice().sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate));
}
