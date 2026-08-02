import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/db';
import type { CategoryRecord, PaymentMethodRecord } from '../db/types';

/** Categories and payment methods together stay under ~40 rows, so they are
 *  read whole and sorted in memory rather than through indexes. */
export function useCatalog() {
  const categories = useLiveQuery(() => db.categories.toArray(), []);
  const payments = useLiveQuery(() => db.paymentMethods.toArray(), []);

  return useMemo(() => {
    const cats = (categories ?? [])
      .filter((c) => !c.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const pays = (payments ?? [])
      .filter((p) => !p.archived)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    return {
      categories: cats,
      homeCategories: cats.filter((c) => c.visibleOnHome && !c.deprecated),
      byId: new Map<string, CategoryRecord>(cats.map((c) => [c.id, c])),
      payments: pays,
      paymentById: new Map<string, PaymentMethodRecord>(pays.map((p) => [p.id, p])),
      loading: categories === undefined || payments === undefined,
    };
  }, [categories, payments]);
}
