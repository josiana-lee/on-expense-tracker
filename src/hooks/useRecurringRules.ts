import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { isTemplateVisible } from '../db/recurring';
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

/** 입력 탭 금액 시트에 띄울 것들. 관리 화면은 전부 보여줘야 하고 입력 화면은
 *  고른 것만 보여줘야 해서 목록이 갈린다. */
export function useVisibleRecurringRules(): RecurringRuleRecord[] {
  return useRecurringRules().filter(isTemplateVisible);
}
