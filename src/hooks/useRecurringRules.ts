import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import type { RecurringRuleRecord } from '../db/types';

/** Most recently used first, then newest. Without a schedule to order them
 *  by, the useful order is how often they are reached for — the templates
 *  someone actually taps rise to the top on their own. */
export function useRecurringRules(): RecurringRuleRecord[] {
  const rules = useLiveQuery(() => db.recurringRules.toArray(), []);
  return (rules ?? [])
    .slice()
    .sort((a, b) => (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || b.createdAt - a.createdAt);
}
